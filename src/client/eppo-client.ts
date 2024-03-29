import axios from 'axios';
import * as md5 from 'md5';

import {
  AssignmentCache,
  Cacheable,
  LRUInMemoryAssignmentCache,
  NonExpiringInMemoryAssignmentCache,
} from '../assignment-cache';
import { IAssignmentHooks } from '../assignment-hooks';
import {
  IAssignmentEvent,
  IAssignmentLogger,
  HoldoutVariationEnum,
  NullableHoldoutVariationType,
} from '../assignment-logger';
import { IConfigurationStore } from '../configuration-store';
import {
  BASE_URL as DEFAULT_BASE_URL,
  DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
  DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
  DEFAULT_REQUEST_TIMEOUT_MS as DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_EVENT_QUEUE_SIZE,
  POLL_INTERVAL_MS,
} from '../constants';
import { IAllocation } from '../dto/allocation-dto';
import { IExperimentConfiguration } from '../dto/experiment-configuration-dto';
import { IVariation } from '../dto/variation-dto';
import { EppoValue, ValueType } from '../eppo_value';
import ExperimentConfigurationRequestor from '../experiment-configuration-requestor';
import HttpClient from '../http-client';
import { getMD5Hash } from '../obfuscation';
import initPoller, { IPoller } from '../poller';
import { findMatchingRule } from '../rule_evaluator';
import { getShard, isShardInRange } from '../shard';
import { validateNotBlank } from '../validation';

/**
 * Client for assigning experiment variations.
 * @public
 */
export interface IEppoClient {
  /**
   * Maps a subject to a variation for a given experiment.
   *
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param flagKey feature flag identifier
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @param assignmentHooks optional interface for pre and post assignment hooks
   * @returns a variation value if the subject is part of the experiment sample, otherwise null
   * @public
   */
  getAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes?: Record<string, any>,
    assignmentHooks?: IAssignmentHooks,
  ): string | null;

  /**
   * Maps a subject to a variation for a given experiment.
   *
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param flagKey feature flag identifier
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns a variation value if the subject is part of the experiment sample, otherwise null
   * @public
   */
  getStringAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes?: Record<string, any>,
    assignmentHooks?: IAssignmentHooks,
  ): string | null;

  getBoolAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes?: Record<string, any>,
    assignmentHooks?: IAssignmentHooks,
  ): boolean | null;

  getNumericAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes?: Record<string, any>,
    assignmentHooks?: IAssignmentHooks,
  ): number | null;

  getJSONStringAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes?: Record<string, any>,
    assignmentHooks?: IAssignmentHooks,
  ): string | null;

  getParsedJSONAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes?: Record<string, any>,
    assignmentHooks?: IAssignmentHooks,
  ): object | null;

  setLogger(logger: IAssignmentLogger): void;

  useLRUInMemoryAssignmentCache(maxSize: number): void;

  useCustomAssignmentCache(cache: AssignmentCache<Cacheable>): void;

  setConfigurationRequestParameters(
    configurationRequestParameters: ExperimentConfigurationRequestParameters,
  ): void;

  fetchFlagConfigurations(): void;

  stopPolling(): void;

  setIsGracefulFailureMode(gracefulFailureMode: boolean): void;
}

export type ExperimentConfigurationRequestParameters = {
  apiKey: string;
  sdkVersion: string;
  sdkName: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
  numInitialRequestRetries?: number;
  numPollRequestRetries?: number;
  pollAfterSuccessfulInitialization?: boolean;
  pollAfterFailedInitialization?: boolean;
  throwOnFailedInitialization?: boolean;
};

export default class EppoClient implements IEppoClient {
  private queuedEvents: IAssignmentEvent[] = [];
  private assignmentLogger: IAssignmentLogger | undefined;
  private isGracefulFailureMode = true;
  private assignmentCache: AssignmentCache<Cacheable> | undefined;
  private configurationStore: IConfigurationStore;
  private configurationRequestParameters: ExperimentConfigurationRequestParameters | undefined;
  private requestPoller: IPoller | undefined;

  constructor(
    configurationStore: IConfigurationStore,
    configurationRequestParameters?: ExperimentConfigurationRequestParameters,
  ) {
    this.configurationStore = configurationStore;
    this.configurationRequestParameters = configurationRequestParameters;
  }

  public setConfigurationRequestParameters(
    configurationRequestParameters: ExperimentConfigurationRequestParameters,
  ) {
    this.configurationRequestParameters = configurationRequestParameters;
  }

  public async fetchFlagConfigurations() {
    if (!this.configurationRequestParameters) {
      throw new Error(
        'Eppo SDK unable to fetch flag configurations without configuration request parameters',
      );
    }

    if (this.requestPoller) {
      // if fetchFlagConfigurations() was previously called, stop any polling process from that call
      this.requestPoller.stop();
    }

    const axiosInstance = axios.create({
      baseURL: this.configurationRequestParameters.baseUrl || DEFAULT_BASE_URL,
      timeout: this.configurationRequestParameters.requestTimeoutMs || DEFAULT_REQUEST_TIMEOUT_MS,
    });
    const httpClient = new HttpClient(axiosInstance, {
      apiKey: this.configurationRequestParameters.apiKey,
      sdkName: this.configurationRequestParameters.sdkName,
      sdkVersion: this.configurationRequestParameters.sdkVersion,
    });
    const configurationRequestor = new ExperimentConfigurationRequestor(
      this.configurationStore,
      httpClient,
    );

    this.requestPoller = initPoller(
      POLL_INTERVAL_MS,
      configurationRequestor.fetchAndStoreConfigurations.bind(configurationRequestor),
      {
        maxStartRetries:
          this.configurationRequestParameters.numInitialRequestRetries ??
          DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
        maxPollRetries:
          this.configurationRequestParameters.numPollRequestRetries ??
          DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
        pollAfterSuccessfulStart:
          this.configurationRequestParameters.pollAfterSuccessfulInitialization ?? false,
        pollAfterFailedStart:
          this.configurationRequestParameters.pollAfterFailedInitialization ?? false,
        errorOnFailedStart:
          this.configurationRequestParameters.throwOnFailedInitialization ?? false,
      },
    );

    await this.requestPoller.start();
  }

  public stopPolling() {
    if (this.requestPoller) {
      this.requestPoller.stop();
    }
  }

  // @deprecated getAssignment is deprecated in favor of the typed get<Type>Assignment methods
  public getAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes: Record<string, any> = {},
    assignmentHooks?: IAssignmentHooks | undefined,
    obfuscated = false,
  ): string | null {
    try {
      return (
        this.getAssignmentVariation(
          subjectKey,
          flagKey,
          subjectAttributes,
          assignmentHooks,
          obfuscated,
        ).stringValue ?? null
      );
    } catch (error) {
      return this.rethrowIfNotGraceful(error);
    }
  }

  public getStringAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes: Record<string, any> = {},
    assignmentHooks?: IAssignmentHooks | undefined,
    obfuscated = false,
  ): string | null {
    try {
      return (
        this.getAssignmentVariation(
          subjectKey,
          flagKey,
          subjectAttributes,
          assignmentHooks,
          obfuscated,
          ValueType.StringType,
        ).stringValue ?? null
      );
    } catch (error) {
      return this.rethrowIfNotGraceful(error);
    }
  }

  getBoolAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes: Record<string, any> = {},
    assignmentHooks?: IAssignmentHooks | undefined,
    obfuscated = false,
  ): boolean | null {
    try {
      return (
        this.getAssignmentVariation(
          subjectKey,
          flagKey,
          subjectAttributes,
          assignmentHooks,
          obfuscated,
          ValueType.BoolType,
        ).boolValue ?? null
      );
    } catch (error) {
      return this.rethrowIfNotGraceful(error);
    }
  }

  getNumericAssignment(
    subjectKey: string,
    flagKey: string,
    subjectAttributes?: Record<string, EppoValue>,
    assignmentHooks?: IAssignmentHooks | undefined,
    obfuscated = false,
  ): number | null {
    try {
      return (
        this.getAssignmentVariation(
          subjectKey,
          flagKey,
          subjectAttributes,
          assignmentHooks,
          obfuscated,
          ValueType.NumericType,
        ).numericValue ?? null
      );
    } catch (error) {
      return this.rethrowIfNotGraceful(error);
    }
  }

  public getJSONStringAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes: Record<string, any> = {},
    assignmentHooks?: IAssignmentHooks | undefined,
    obfuscated = false,
  ): string | null {
    try {
      return (
        this.getAssignmentVariation(
          subjectKey,
          flagKey,
          subjectAttributes,
          assignmentHooks,
          obfuscated,
          ValueType.JSONType,
        ).stringValue ?? null
      );
    } catch (error) {
      return this.rethrowIfNotGraceful(error);
    }
  }

  public getParsedJSONAssignment(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes: Record<string, any> = {},
    assignmentHooks?: IAssignmentHooks | undefined,
    obfuscated = false,
  ): object | null {
    try {
      return (
        this.getAssignmentVariation(
          subjectKey,
          flagKey,
          subjectAttributes,
          assignmentHooks,
          obfuscated,
          ValueType.JSONType,
        ).objectValue ?? null
      );
    } catch (error) {
      return this.rethrowIfNotGraceful(error);
    }
  }

  private rethrowIfNotGraceful(err: Error): null {
    if (this.isGracefulFailureMode) {
      console.error(`[Eppo SDK] Error getting assignment: ${err.message}`);
      return null;
    }
    throw err;
  }

  private getAssignmentVariation(
    subjectKey: string,
    flagKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes: Record<string, any> = {},
    assignmentHooks: IAssignmentHooks | undefined,
    obfuscated: boolean,
    valueType?: ValueType,
  ): EppoValue {
    const { allocationKey, assignment, holdoutKey, holdoutVariation } = this.getAssignmentInternal(
      subjectKey,
      flagKey,
      subjectAttributes,
      assignmentHooks,
      obfuscated,
      valueType,
    );
    assignmentHooks?.onPostAssignment(flagKey, subjectKey, assignment, allocationKey);

    if (!assignment.isNullType() && allocationKey !== null)
      this.logAssignment(
        flagKey,
        allocationKey,
        assignment,
        subjectKey,
        holdoutKey,
        holdoutVariation,
        subjectAttributes,
      );

    return assignment;
  }

  private getAssignmentInternal(
    subjectKey: string,
    flagKey: string,
    subjectAttributes = {},
    assignmentHooks: IAssignmentHooks | undefined,
    obfuscated: boolean,
    expectedValueType?: ValueType,
  ): {
    allocationKey: string | null;
    assignment: EppoValue;
    holdoutKey: string | null;
    holdoutVariation: NullableHoldoutVariationType;
  } {
    validateNotBlank(subjectKey, 'Invalid argument: subjectKey cannot be blank');
    validateNotBlank(flagKey, 'Invalid argument: flagKey cannot be blank');

    const nullAssignment = {
      allocationKey: null,
      assignment: EppoValue.Null(),
      holdoutKey: null,
      holdoutVariation: null,
    };

    const experimentConfig = this.configurationStore.get<IExperimentConfiguration>(
      obfuscated ? getMD5Hash(flagKey) : flagKey,
    );
    const allowListOverride = this.getSubjectVariationOverride(
      subjectKey,
      experimentConfig,
      expectedValueType,
    );

    if (!allowListOverride.isNullType()) {
      if (!allowListOverride.isExpectedType()) {
        return nullAssignment;
      }
      return { ...nullAssignment, assignment: allowListOverride };
    }

    // Check for disabled flag.
    if (!experimentConfig?.enabled) return nullAssignment;

    // check for overridden assignment via hook
    const overriddenAssignment = assignmentHooks?.onPreAssignment(flagKey, subjectKey);
    if (overriddenAssignment !== null && overriddenAssignment !== undefined) {
      if (!overriddenAssignment.isExpectedType()) return nullAssignment;
      return { ...nullAssignment, assignment: overriddenAssignment };
    }

    // Attempt to match a rule from the list.
    const matchedRule = findMatchingRule(
      subjectAttributes || {},
      experimentConfig.rules,
      obfuscated,
    );
    if (!matchedRule) return nullAssignment;

    // Check if subject is in allocation sample.
    const allocation = experimentConfig.allocations[matchedRule.allocationKey];
    if (!this.isInExperimentSample(subjectKey, flagKey, experimentConfig, allocation))
      return nullAssignment;

    // Compute variation for subject.
    const { subjectShards } = experimentConfig;
    const { variations, holdouts, statusQuoVariationKey, shippedVariationKey } = allocation;

    let assignedVariation: IVariation | undefined;
    let holdoutVariation = null;

    const holdoutShard = getShard(`holdout-${subjectKey}`, subjectShards);
    const matchingHoldout = holdouts?.find((holdout) => {
      const { statusQuoShardRange, shippedShardRange } = holdout;
      if (isShardInRange(holdoutShard, statusQuoShardRange)) {
        assignedVariation = variations.find(
          (variation) => variation.variationKey === statusQuoVariationKey,
        );
        // Only log the holdout variation if this is a rollout allocation
        // Only rollout allocations have shippedShardRange specified
        if (shippedShardRange) {
          holdoutVariation = HoldoutVariationEnum.STATUS_QUO;
        }
      } else if (shippedShardRange && isShardInRange(holdoutShard, shippedShardRange)) {
        assignedVariation = variations.find(
          (variation) => variation.variationKey === shippedVariationKey,
        );
        holdoutVariation = HoldoutVariationEnum.ALL_SHIPPED;
      }
      return assignedVariation;
    });
    const holdoutKey = matchingHoldout?.holdoutKey ?? null;
    if (!matchingHoldout) {
      const assignmentShard = getShard(`assignment-${subjectKey}-${flagKey}`, subjectShards);
      assignedVariation = variations.find((variation) =>
        isShardInRange(assignmentShard, variation.shardRange),
      );
    }

    const internalAssignment: {
      allocationKey: string;
      assignment: EppoValue;
      holdoutKey: string | null;
      holdoutVariation: NullableHoldoutVariationType;
    } = {
      allocationKey: matchedRule.allocationKey,
      assignment: EppoValue.generateEppoValue(
        expectedValueType,
        assignedVariation?.value,
        assignedVariation?.typedValue,
      ),
      holdoutKey,
      holdoutVariation: holdoutVariation as NullableHoldoutVariationType,
    };
    return internalAssignment.assignment.isExpectedType() ? internalAssignment : nullAssignment;
  }

  public setLogger(logger: IAssignmentLogger) {
    this.assignmentLogger = logger;
    this.flushQueuedEvents(); // log any events that may have been queued while initializing
  }

  /**
   * Assignment cache methods.
   */
  public disableAssignmentCache() {
    this.assignmentCache = undefined;
  }

  public useNonExpiringInMemoryAssignmentCache() {
    this.assignmentCache = new NonExpiringInMemoryAssignmentCache();
  }

  public useLRUInMemoryAssignmentCache(maxSize: number) {
    this.assignmentCache = new LRUInMemoryAssignmentCache(maxSize);
  }

  public useCustomAssignmentCache(cache: AssignmentCache<Cacheable>) {
    this.assignmentCache = cache;
  }

  public setIsGracefulFailureMode(gracefulFailureMode: boolean) {
    this.isGracefulFailureMode = gracefulFailureMode;
  }

  private flushQueuedEvents() {
    const eventsToFlush = this.queuedEvents;
    this.queuedEvents = [];
    try {
      for (const event of eventsToFlush) {
        this.assignmentLogger?.logAssignment(event);
      }
    } catch (error) {
      console.error(`[Eppo SDK] Error flushing assignment events: ${error.message}`);
    }
  }

  private logAssignment(
    flagKey: string,
    allocationKey: string,
    variation: EppoValue,
    subjectKey: string,
    holdout: string | null,
    holdoutVariation: NullableHoldoutVariationType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes: Record<string, any> | undefined = {},
  ) {
    if (
      this.assignmentCache?.hasLoggedAssignment({
        flagKey,
        subjectKey,
        allocationKey,
        variationValue: variation,
      })
    ) {
      return;
    }

    const event: IAssignmentEvent = {
      allocation: allocationKey,
      experiment: `${flagKey}-${allocationKey}`,
      featureFlag: flagKey,
      variation: variation.toString(), // return the string representation to the logging callback
      timestamp: new Date().toISOString(),
      subject: subjectKey,
      holdout,
      holdoutVariation,
      subjectAttributes,
    };
    // assignment logger may be null while waiting for initialization
    if (this.assignmentLogger == null) {
      this.queuedEvents.length < MAX_EVENT_QUEUE_SIZE && this.queuedEvents.push(event);
      return;
    }
    try {
      this.assignmentLogger.logAssignment(event);
      this.assignmentCache?.setLastLoggedAssignment({
        flagKey,
        subjectKey,
        allocationKey,
        variationValue: variation,
      });
    } catch (error) {
      console.error(`[Eppo SDK] Error logging assignment event: ${error.message}`);
    }
  }

  private getSubjectVariationOverride(
    subjectKey: string,
    experimentConfig: IExperimentConfiguration,
    expectedValueType?: ValueType,
  ): EppoValue {
    const subjectHash = md5(subjectKey);
    const override = experimentConfig?.overrides && experimentConfig.overrides[subjectHash];
    const typedOverride =
      experimentConfig?.typedOverrides && experimentConfig.typedOverrides[subjectHash];
    return EppoValue.generateEppoValue(expectedValueType, override, typedOverride);
  }

  /**
   * This checks whether the subject is included in the experiment sample.
   * It is used to determine whether the subject should be assigned to a variant.
   * Given a hash function output (bucket), check whether the bucket is between 0 and exposure_percent * total_buckets.
   */
  private isInExperimentSample(
    subjectKey: string,
    flagKey: string,
    experimentConfig: IExperimentConfiguration,
    allocation: IAllocation,
  ): boolean {
    const { subjectShards } = experimentConfig;
    const { percentExposure } = allocation;
    const shard = getShard(`exposure-${subjectKey}-${flagKey}`, subjectShards);
    return shard <= percentExposure * subjectShards;
  }
}
