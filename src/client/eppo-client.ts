import axios from 'axios';

import {
  AssignmentCache,
  Cacheable,
  LRUInMemoryAssignmentCache,
  NonExpiringInMemoryAssignmentCache,
} from '../assignment-cache';
import { IAssignmentEvent, IAssignmentLogger } from '../assignment-logger';
import { IConfigurationStore } from '../configuration-store';
import {
  BASE_URL as DEFAULT_BASE_URL,
  DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
  DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
  DEFAULT_REQUEST_TIMEOUT_MS as DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_EVENT_QUEUE_SIZE,
  POLL_INTERVAL_MS,
} from '../constants';
import { EppoValue } from '../eppo_value';
import { Evaluator, FlagEvaluation, noneResult } from '../evaluator';
import ExperimentConfigurationRequestor from '../flag-configuration-requestor';
import HttpClient from '../http-client';
import { Flag, VariationType } from '../interfaces';
import { getMD5Hash } from '../obfuscation';
import initPoller, { IPoller } from '../poller';
import { AttributeType, ValueType } from '../types';
import { validateNotBlank } from '../validation';
import { LIB_VERSION } from '../version';

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
   * @returns a variation value if the subject is part of the experiment sample, otherwise null
   * @public
   */
  getStringAssignment(
    subjectKey: string,
    flagKey: string,
    defaultValue: string,
    subjectAttributes?: Record<string, AttributeType>,
  ): string;

  getBoolAssignment(
    subjectKey: string,
    flagKey: string,
    defaultValue: boolean,
    subjectAttributes?: Record<string, AttributeType>,
  ): boolean;

  getIntegerAssignment(
    subjectKey: string,
    flagKey: string,
    defaultValue: number,
    subjectAttributes?: Record<string, AttributeType>,
  ): number;

  getNumericAssignment(
    subjectKey: string,
    flagKey: string,
    defaultValue: number,
    subjectAttributes?: Record<string, AttributeType>,
  ): number;

  getJSONAssignment(
    subjectKey: string,
    flagKey: string,
    defaultValue: object,
    subjectAttributes?: Record<string, AttributeType>,
  ): object;

  setLogger(logger: IAssignmentLogger): void;

  useLRUInMemoryAssignmentCache(maxSize: number): void;

  useCustomAssignmentCache(cache: AssignmentCache<Cacheable>): void;

  setConfigurationRequestParameters(
    configurationRequestParameters: FlagConfigurationRequestParameters,
  ): void;

  fetchFlagConfigurations(): void;

  stopPolling(): void;

  setIsGracefulFailureMode(gracefulFailureMode: boolean): void;

  getFlagKeys(): string[];

  isInitialized(): boolean;
}

export type FlagConfigurationRequestParameters = {
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
  private isObfuscated = false;
  private assignmentCache: AssignmentCache<Cacheable> | undefined;
  private configurationStore: IConfigurationStore;
  private configurationRequestParameters: FlagConfigurationRequestParameters | undefined;
  private requestPoller: IPoller | undefined;
  private evaluator: Evaluator;

  constructor(
    configurationStore: IConfigurationStore,
    configurationRequestParameters?: FlagConfigurationRequestParameters,
    obfuscated = false,
  ) {
    this.evaluator = new Evaluator();
    this.configurationStore = configurationStore;
    this.configurationRequestParameters = configurationRequestParameters;
    this.isObfuscated = obfuscated;
  }

  public setConfigurationRequestParameters(
    configurationRequestParameters: FlagConfigurationRequestParameters,
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

  public getStringAssignment(
    subjectKey: string,
    flagKey: string,
    defaultValue: string,
    subjectAttributes: Record<string, AttributeType> = {},
  ): string {
    return (
      this.getAssignmentVariation(
        subjectKey,
        flagKey,
        EppoValue.String(defaultValue),
        subjectAttributes,
        VariationType.STRING,
      ).stringValue ?? defaultValue
    );
  }

  getBoolAssignment(
    subjectKey: string,
    flagKey: string,
    defaultValue: boolean,
    subjectAttributes: Record<string, AttributeType> = {},
  ): boolean {
    return (
      this.getAssignmentVariation(
        subjectKey,
        flagKey,
        EppoValue.Bool(defaultValue),
        subjectAttributes,
        VariationType.BOOLEAN,
      ).boolValue ?? defaultValue
    );
  }

  getIntegerAssignment(
    subjectKey: string,
    flagKey: string,
    defaultValue: number,
    subjectAttributes?: Record<string, AttributeType>,
  ): number {
    return (
      this.getAssignmentVariation(
        subjectKey,
        flagKey,
        EppoValue.Numeric(defaultValue),
        subjectAttributes,
        VariationType.INTEGER,
      ).numericValue ?? defaultValue
    );
  }

  getNumericAssignment(
    subjectKey: string,
    flagKey: string,
    defaultValue: number,
    subjectAttributes?: Record<string, AttributeType>,
  ): number {
    return (
      this.getAssignmentVariation(
        subjectKey,
        flagKey,
        EppoValue.Numeric(defaultValue),
        subjectAttributes,
        VariationType.NUMERIC,
      ).numericValue ?? defaultValue
    );
  }

  public getJSONAssignment(
    subjectKey: string,
    flagKey: string,
    defaultValue: object,
    subjectAttributes: Record<string, AttributeType> = {},
  ): object {
    return (
      this.getAssignmentVariation(
        subjectKey,
        flagKey,
        EppoValue.JSON(defaultValue),
        subjectAttributes,
        VariationType.JSON,
      ).objectValue ?? defaultValue
    );
  }

  private getAssignmentVariation(
    subjectKey: string,
    flagKey: string,
    defaultValue: EppoValue,
    subjectAttributes: Record<string, AttributeType> = {},
    expectedVariationType: VariationType,
  ): EppoValue {
    try {
      const result = this.getAssignmentDetail(
        subjectKey,
        flagKey,
        subjectAttributes,
        expectedVariationType,
      );

      if (!result.variation) {
        return defaultValue;
      }

      return EppoValue.valueOf(result.variation.value, expectedVariationType);
    } catch (error) {
      return this.rethrowIfNotGraceful(error, defaultValue);
    }
  }

  private rethrowIfNotGraceful(err: Error, defaultValue?: EppoValue): EppoValue {
    if (this.isGracefulFailureMode) {
      console.error(`[Eppo SDK] Error getting assignment: ${err.message}`);
      return defaultValue ?? EppoValue.Null();
    }
    throw err;
  }

  /**
   * [Experimental] Get a detailed return of assignment for a particular subject and flag.
   *
   * Note: This method is experimental and may change in future versions.
   * Please only use for debugging purposes, and not in production.
   *
   * @param subjectKey The subject key
   * @param flagKey The flag key
   * @param subjectAttributes The subject attributes
   * @param expectedVariationType The expected variation type
   * @param obfuscated Whether the flag key is obfuscated
   * @returns A detailed return of assignment for a particular subject and flag
   */
  public getAssignmentDetail(
    subjectKey: string,
    flagKey: string,
    subjectAttributes: Record<string, AttributeType> = {},
    expectedVariationType?: VariationType,
  ): FlagEvaluation {
    validateNotBlank(subjectKey, 'Invalid argument: subjectKey cannot be blank');
    validateNotBlank(flagKey, 'Invalid argument: flagKey cannot be blank');

    const flag = this.getFlag(flagKey);

    if (flag === null) {
      console.warn(`[Eppo SDK] No assigned variation. Flag not found: ${flagKey}`);
      // note: this is different from the Python SDK, which returns None instead
      return noneResult(flagKey, subjectKey, subjectAttributes);
    }

    if (!this.checkTypeMatch(expectedVariationType, flag.variationType)) {
      throw new TypeError(
        `Variation value does not have the correct type. Found: ${flag.variationType} != ${expectedVariationType}`,
      );
    }

    if (!flag.enabled) {
      console.info(`[Eppo SDK] No assigned variation. Flag is disabled: ${flagKey}`);
      // note: this is different from the Python SDK, which returns None instead
      return noneResult(flagKey, subjectKey, subjectAttributes);
    }

    const result = this.evaluator.evaluateFlag(
      flag,
      subjectKey,
      subjectAttributes,
      this.isObfuscated,
    );
    if (this.isObfuscated) {
      // flag.key is obfuscated, replace with requested flag key
      result.flagKey = flagKey;
    }

    if (
      result?.variation &&
      !this.checkValueTypeMatch(expectedVariationType, result.variation.value)
    ) {
      return noneResult(flagKey, subjectKey, subjectAttributes);
    }

    try {
      if (result?.doLog) {
        this.logAssignment(result);
      }
    } catch (error) {
      console.error(`[Eppo SDK] Error logging assignment event: ${error}`);
    }

    return result;
  }

  private getFlag(flagKey: string): Flag | null {
    const flag: Flag = this.configurationStore.get(
      this.isObfuscated ? getMD5Hash(flagKey) : flagKey,
    );
    return flag;
  }

  private checkTypeMatch(expectedType?: VariationType, actualType?: VariationType): boolean {
    return expectedType === undefined || actualType === expectedType;
  }

  private checkValueTypeMatch(expectedType: VariationType | undefined, value: ValueType): boolean {
    if (expectedType == undefined) {
      return true;
    }

    switch (expectedType) {
      case VariationType.STRING:
        return typeof value === 'string';
      case VariationType.BOOLEAN:
        return typeof value === 'boolean';
      case VariationType.INTEGER:
        return typeof value === 'number' && Number.isInteger(value);
      case VariationType.NUMERIC:
        return typeof value === 'number';
      case VariationType.JSON:
        // note: converting to object downstream
        return typeof value === 'string';
      default:
        return false;
    }
  }

  public getFlagKeys() {
    /**
     * Returns a list of all flag keys that have been initialized.
     * This can be useful to debug the initialization process.
     *
     * Note that it is generally not a good idea to pre-load all flag configurations.
     */
    return this.configurationStore.getKeys();
  }

  public isInitialized() {
    return this.configurationStore.isInitialized();
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

  private logAssignment(result: FlagEvaluation) {
    const event: IAssignmentEvent = {
      ...(result.extraLogging ?? {}),
      allocation: result.allocationKey ?? null,
      experiment: result.allocationKey ? `${result.flagKey}-${result.allocationKey}` : null,
      featureFlag: result.flagKey,
      variation: result.variation?.key ?? null,
      subject: result.subjectKey,
      timestamp: new Date().toISOString(),
      subjectAttributes: result.subjectAttributes,
      metaData: {
        obfuscated: this.isObfuscated,
        sdkLanguage: 'javascript',
        sdkLibVersion: LIB_VERSION,
      },
    };

    if (
      result.variation &&
      result.allocationKey &&
      this.assignmentCache?.hasLoggedAssignment({
        flagKey: result.flagKey,
        subjectKey: result.subjectKey,
        allocationKey: result.allocationKey,
        variationKey: result.variation.key,
      })
    ) {
      return;
    }

    // assignment logger may be null while waiting for initialization
    if (this.assignmentLogger == null) {
      this.queuedEvents.length < MAX_EVENT_QUEUE_SIZE && this.queuedEvents.push(event);
      return;
    }
    try {
      this.assignmentLogger.logAssignment(event);
      this.assignmentCache?.setLastLoggedAssignment({
        flagKey: result.flagKey,
        subjectKey: result.subjectKey,
        allocationKey: result.allocationKey ?? '__eppo_no_allocation',
        variationKey: result.variation?.key ?? '__eppo_no_variation',
      });
    } catch (error) {
      console.error(`[Eppo SDK] Error logging assignment event: ${error.message}`);
    }
  }
}
