import * as md5 from 'md5';

import {
  AssignmentCache,
  Cacheable,
  LRUAssignmentCache,
  NonExpiringAssignmentCache,
} from '../assignment-cache';
import { IAssignmentHooks } from '../assignment-hooks';
import { IAssignmentEvent, IAssignmentLogger } from '../assignment-logger';
import { IConfigurationStore } from '../configuration-store';
import { MAX_EVENT_QUEUE_SIZE } from '../constants';
import { IAllocation } from '../dto/allocation-dto';
import { IExperimentConfiguration } from '../dto/experiment-configuration-dto';
import { IHoldout } from '../dto/holdout-dto';
import { EppoValue, ValueType } from '../eppo_value';
import { getMD5Hash } from '../obfuscation';
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
}

export default class EppoClient implements IEppoClient {
  private queuedEvents: IAssignmentEvent[] = [];
  private assignmentLogger: IAssignmentLogger | undefined;
  private isGracefulFailureMode = true;
  private assignmentCache: AssignmentCache<Cacheable> | undefined;

  constructor(private configurationStore: IConfigurationStore) {}

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
    const { allocationKey, assignment } = this.getAssignmentInternal(
      subjectKey,
      flagKey,
      subjectAttributes,
      assignmentHooks,
      obfuscated,
      valueType,
    );
    assignmentHooks?.onPostAssignment(flagKey, subjectKey, assignment, allocationKey);

    if (!assignment.isNullType() && allocationKey !== null)
      this.logAssignment(flagKey, allocationKey, assignment, subjectKey, subjectAttributes);

    return assignment;
  }

  private getAssignmentInternal(
    subjectKey: string,
    flagKey: string,
    subjectAttributes = {},
    assignmentHooks: IAssignmentHooks | undefined,
    obfuscated: boolean,
    expectedValueType?: ValueType,
  ): { allocationKey: string | null; assignment: EppoValue } {
    validateNotBlank(subjectKey, 'Invalid argument: subjectKey cannot be blank');
    validateNotBlank(flagKey, 'Invalid argument: flagKey cannot be blank');

    const nullAssignment = { allocationKey: null, assignment: EppoValue.Null() };

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
    const { variations, holdout } = allocation;

    let assignedVariation, holdoutKey, holdoutVariation;

    if (this.isInHoldoutSample(subjectKey, flagKey, experimentConfig, holdout)) {
      const { statusQuo, shipped, keys } = holdout;
      const holdoutShard = getShard(`holdout-${subjectKey}-${flagKey}`, subjectShards);
      const matchingHoldout = keys.find((key) =>
        isShardInRange(holdoutShard, key.statusQuoShardRange),
      );
      if (matchingHoldout) {
        // The holdout serves status quo before rollout or within rollout split
        holdoutKey = matchingHoldout?.holdoutKey;
        assignedVariation = variations.find((variation) => variation.variationKey === statusQuo);
        holdoutVariation = 'status_quo';
      } else {
        // To serve shipped, shipped and shippedShardRange are both defined
        holdoutKey = keys.find(
          (key) =>
            key.shippedShardRange != null && isShardInRange(holdoutShard, key.shippedShardRange),
        )?.holdoutKey;
        assignedVariation = variations.find((variation) => variation.variationKey === shipped);
        holdoutVariation = 'shipped';
      }
    } else {
      const shard = getShard(`assignment-${subjectKey}-${flagKey}`, subjectShards);
      assignedVariation = variations.find((variation) =>
        isShardInRange(shard, variation.shardRange),
      );
    }

    const internalAssignment = {
      holdoutKey,
      holdoutVariation,
      allocationKey: matchedRule.allocationKey,
      assignment: EppoValue.generateEppoValue(
        expectedValueType,
        assignedVariation?.value,
        assignedVariation?.typedValue,
      ),
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

  public useNonExpiringAssignmentCache() {
    this.assignmentCache = new NonExpiringAssignmentCache();
  }

  public useLRUAssignmentCache(maxSize: number) {
    this.assignmentCache = new LRUAssignmentCache(maxSize);
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

  private isInHoldoutSample(
    subjectKey: string,
    flagKey: string,
    experimentConfig: IExperimentConfiguration,
    holdout: IHoldout,
  ): boolean {
    const { subjectShards } = experimentConfig;
    const { percentExposure } = holdout;
    const shard = getShard(`holdout-${subjectKey}-${flagKey}`, subjectShards);
    return shard <= percentExposure * subjectShards;
  }
}
