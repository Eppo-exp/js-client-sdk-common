import ApiEndpoints from '../api-endpoints';
import { logger } from '../application-logger';
import { IAssignmentEvent, IAssignmentLogger } from '../assignment-logger';
import { BanditEvaluator } from '../bandit-evaluator';
import { IBanditEvent, IBanditLogger } from '../bandit-logger';
import {
  AssignmentCache,
  LRUInMemoryAssignmentCache,
  NonExpiringInMemoryAssignmentCache,
} from '../cache/assignment-cache';
import ConfigurationRequestor from '../configuration-requestor';
import { IConfigurationStore } from '../configuration-store/configuration-store';
import {
  BASE_URL as DEFAULT_BASE_URL,
  DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
  DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
  DEFAULT_REQUEST_TIMEOUT_MS as DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_EVENT_QUEUE_SIZE,
  POLL_INTERVAL_MS,
} from '../constants';
import { decodeFlag } from '../decoding';
import { EppoValue } from '../eppo_value';
import { Evaluator, FlagEvaluation, noneResult } from '../evaluator';
import FetchHttpClient from '../http-client';
import { BanditParameters, Flag, ObfuscatedFlag, VariationType } from '../interfaces';
import { getMD5Hash } from '../obfuscation';
import initPoller, { IPoller } from '../poller';
import { Attributes, AttributeType, ValueType } from '../types';
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
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns a variation value if the subject is part of the experiment sample, otherwise the default value
   * @public
   */
  getStringAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: string,
  ): string;

  /**
   * @deprecated use getBooleanAssignment instead.
   */
  getBoolAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: boolean,
  ): boolean;

  /**
   * Maps a subject to a boolean variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a boolean variation value if the subject is part of the experiment sample, otherwise the default value
   */
  getBooleanAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: boolean,
  ): boolean;

  /**
   * Maps a subject to an Integer variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a number variation value if the subject is part of the experiment sample, otherwise the default value
   */
  getIntegerAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: number,
  ): number;

  /**
   * Maps a subject to a Numeric variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a number variation value if the subject is part of the experiment sample, otherwise the default value
   */
  getNumericAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: number,
  ): number;

  /**
   * Maps a subject to a JSON variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a JSON object variation value if the subject is part of the experiment sample, otherwise the default value
   */
  getJSONAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: object,
  ): object;

  setAssignmentLogger(assignmentLogger: IAssignmentLogger): void;

  setBanditLogger(banditLogger: IBanditLogger): void;

  useLRUInMemoryAssignmentCache(maxSize: number): void;

  useCustomAssignmentCache(cache: AssignmentCache): void;

  setConfigurationRequestParameters(
    configurationRequestParameters: FlagConfigurationRequestParameters,
  ): void;

  setFlagConfigurationStore(configurationStore: IConfigurationStore<Flag | ObfuscatedFlag>): void;

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
  skipInitialPoll?: boolean;
};

export default class EppoClient implements IEppoClient {
  private queuedAssignmentEvents: IAssignmentEvent[] = [];
  private assignmentLogger?: IAssignmentLogger;
  private queuedBanditEvents: IBanditEvent[] = [];
  private banditLogger?: IBanditLogger;
  private isGracefulFailureMode = true;
  private assignmentCache?: AssignmentCache;
  private requestPoller?: IPoller;
  private evaluator = new Evaluator();
  private banditEvaluator = new BanditEvaluator();

  constructor(
    private flagConfigurationStore: IConfigurationStore<Flag | ObfuscatedFlag>,
    private banditConfigurationStore?: IConfigurationStore<BanditParameters>,
    private configurationRequestParameters?: FlagConfigurationRequestParameters,
    private readonly isObfuscated = false,
  ) {}

  public setConfigurationRequestParameters(
    configurationRequestParameters: FlagConfigurationRequestParameters,
  ) {
    this.configurationRequestParameters = configurationRequestParameters;
  }

  public setFlagConfigurationStore(
    flagConfigurationStore: IConfigurationStore<Flag | ObfuscatedFlag>,
  ) {
    this.flagConfigurationStore = flagConfigurationStore;
  }

  public setBanditConfigurationStore(
    banditConfigurationStore: IConfigurationStore<BanditParameters>,
  ) {
    this.banditConfigurationStore = banditConfigurationStore;
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

    const isExpired = await this.flagConfigurationStore.isExpired();
    if (!isExpired) {
      logger.info(
        '[Eppo SDK] Configuration store is not expired. Skipping fetching flag configurations',
      );
      return;
    }
    const {
      apiKey,
      sdkName,
      sdkVersion,
      baseUrl = DEFAULT_BASE_URL,
      requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
      numInitialRequestRetries = DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
      numPollRequestRetries = DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
      pollAfterSuccessfulInitialization = false,
      pollAfterFailedInitialization = false,
      throwOnFailedInitialization = false,
      skipInitialPoll = false,
    } = this.configurationRequestParameters;
    // todo: Inject the chain of dependencies below
    const apiEndpoints = new ApiEndpoints(baseUrl, { apiKey, sdkName, sdkVersion });
    const httpClient = new FetchHttpClient(apiEndpoints, requestTimeoutMs);
    const configurationRequestor = new ConfigurationRequestor(
      httpClient,
      this.flagConfigurationStore,
      this.banditConfigurationStore ?? null,
    );

    this.requestPoller = initPoller(
      POLL_INTERVAL_MS,
      configurationRequestor.fetchAndStoreConfigurations.bind(configurationRequestor),
      {
        maxStartRetries: numInitialRequestRetries,
        maxPollRetries: numPollRequestRetries,
        pollAfterSuccessfulStart: pollAfterSuccessfulInitialization,
        pollAfterFailedStart: pollAfterFailedInitialization,
        errorOnFailedStart: throwOnFailedInitialization,
        skipInitialPoll: skipInitialPoll,
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
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: string,
  ): string {
    return (
      this.getAssignmentVariation(
        flagKey,
        subjectKey,
        subjectAttributes,
        EppoValue.String(defaultValue),
        VariationType.STRING,
      ).stringValue ?? defaultValue
    );
  }

  public getBoolAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: boolean,
  ): boolean {
    return this.getBooleanAssignment(flagKey, subjectKey, subjectAttributes, defaultValue);
  }

  public getBooleanAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: boolean,
  ): boolean {
    return (
      this.getAssignmentVariation(
        flagKey,
        subjectKey,
        subjectAttributes,
        EppoValue.Bool(defaultValue),
        VariationType.BOOLEAN,
      ).boolValue ?? defaultValue
    );
  }

  public getIntegerAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: number,
  ): number {
    return (
      this.getAssignmentVariation(
        flagKey,
        subjectKey,
        subjectAttributes,
        EppoValue.Numeric(defaultValue),
        VariationType.INTEGER,
      ).numericValue ?? defaultValue
    );
  }

  public getNumericAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: number,
  ): number {
    return (
      this.getAssignmentVariation(
        flagKey,
        subjectKey,
        subjectAttributes,
        EppoValue.Numeric(defaultValue),
        VariationType.NUMERIC,
      ).numericValue ?? defaultValue
    );
  }

  public getJSONAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: object,
  ): object {
    return (
      this.getAssignmentVariation(
        flagKey,
        subjectKey,
        subjectAttributes,
        EppoValue.JSON(defaultValue),
        VariationType.JSON,
      ).objectValue ?? defaultValue
    );
  }

  public getBanditAction(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Attributes,
    actions: Record<string, Attributes>, // TODO: ability to provide a set of actions with no context, or context broken out by numeric/categorical
    defaultValue: string,
  ): { variation: string; action: string | null } {
    let variation = this.getStringAssignment(flagKey, subjectKey, subjectAttributes, defaultValue);
    let action: string | null = null;
    const banditKey = variation;
    try {
      const banditParameters = this.banditConfigurationStore?.get(banditKey);
      if (banditParameters && !Object.keys(actions ?? {}).length) {
        // If it's a bandit, but we have no actions, just return default value
        variation = defaultValue;
      } else if (banditParameters) {
        // For now, we use the shortcut of assuming if a variation value is the key of a known bandit, that is the bandit we want
        const banditModelData = banditParameters.modelData;
        const banditEvaluation = this.banditEvaluator.evaluateBandit(
          flagKey,
          subjectKey,
          subjectAttributes,
          actions,
          banditModelData,
        );
        action = banditEvaluation.actionKey;

        const banditEvent: IBanditEvent = {
          timestamp: new Date().toISOString(),
          featureFlag: flagKey,
          bandit: banditKey,
          subject: subjectKey,
          action,
          actionProbability: banditEvaluation.actionWeight,
          optimalityGap: banditEvaluation.optimalityGap,
          modelVersion: banditParameters.modelVersion,
          // TODO: bucket these out ahead of time
          subjectNumericAttributes: this.pruneValuesByType(subjectAttributes, true),
          subjectCategoricalAttributes: this.pruneValuesByType(subjectAttributes, false),
          actionNumericAttributes: this.pruneValuesByType(actions[action], true),
          actionCategoricalAttributes: this.pruneValuesByType(actions[action], false),
          metaData: this.buildLoggerMetadata(),
        };
        this.logBanditAction(banditEvent);
      }
    } catch (err) {
      if (this.isGracefulFailureMode) {
        logger.error('Error evaluating bandit action', err);
        variation = defaultValue;
      } else {
        throw err;
      }
    }
    return { variation, action };
  }

  private logBanditAction(banditEvent: IBanditEvent): void {
    if (!this.banditLogger) {
      // No bandit logger set; enqueue the event in case a logger is later set
      if (this.queuedBanditEvents.length < MAX_EVENT_QUEUE_SIZE) {
        this.queuedBanditEvents.push(banditEvent);
      }
      return;
    }
    // If here, we have a logger
    try {
      this.banditLogger.logBanditAction(banditEvent);
    } catch (err) {
      logger.warn('Error encountered logging bandit action', err);
    }
  }

  // TODO: this method can be repurposed to bucket attributes once bandit signatures updated
  private pruneValuesByType(attributes: Attributes, numeric: boolean): Attributes {
    const result: Attributes = {};
    Object.entries(attributes).forEach(([key, value]) => {
      const isNumeric = typeof value === 'number' && isFinite(value);
      if (isNumeric === numeric) {
        result[key] = value;
      }
    });
    return result;
  }

  private getAssignmentVariation(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: EppoValue,
    expectedVariationType: VariationType,
  ): EppoValue {
    try {
      const result = this.getAssignmentDetail(
        flagKey,
        subjectKey,
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
      logger.error(`[Eppo SDK] Error getting assignment: ${err.message}`);
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
   * @param flagKey The flag key
   * @param subjectKey The subject key
   * @param subjectAttributes The subject attributes
   * @param expectedVariationType The expected variation type
   * @returns A detailed return of assignment for a particular subject and flag
   */
  public getAssignmentDetail(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType> = {},
    expectedVariationType?: VariationType,
  ): FlagEvaluation {
    validateNotBlank(subjectKey, 'Invalid argument: subjectKey cannot be blank');
    validateNotBlank(flagKey, 'Invalid argument: flagKey cannot be blank');

    const flag = this.getFlag(flagKey);

    if (flag === null) {
      logger.warn(`[Eppo SDK] No assigned variation. Flag not found: ${flagKey}`);
      // note: this is different from the Python SDK, which returns None instead
      return noneResult(flagKey, subjectKey, subjectAttributes);
    }

    if (!checkTypeMatch(expectedVariationType, flag.variationType)) {
      throw new TypeError(
        `Variation value does not have the correct type. Found: ${flag.variationType} != ${expectedVariationType} for flag ${flagKey}`,
      );
    }

    if (!flag.enabled) {
      logger.info(`[Eppo SDK] No assigned variation. Flag is disabled: ${flagKey}`);
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

    if (result?.variation && !checkValueTypeMatch(expectedVariationType, result.variation.value)) {
      return noneResult(flagKey, subjectKey, subjectAttributes);
    }

    try {
      if (result?.doLog) {
        this.logAssignment(result);
      }
    } catch (error) {
      logger.error(`[Eppo SDK] Error logging assignment event: ${error}`);
    }

    return result;
  }

  private getFlag(flagKey: string): Flag | null {
    if (this.isObfuscated) {
      return this.getObfuscatedFlag(flagKey);
    }
    return this.flagConfigurationStore.get(flagKey);
  }

  private getObfuscatedFlag(flagKey: string): Flag | null {
    const flag: ObfuscatedFlag | null = this.flagConfigurationStore.get(
      getMD5Hash(flagKey),
    ) as ObfuscatedFlag;
    return flag ? decodeFlag(flag) : null;
  }

  public getFlagKeys() {
    /**
     * Returns a list of all flag keys that have been initialized.
     * This can be useful to debug the initialization process.
     *
     * Note that it is generally not a good idea to pre-load all flag configurations.
     */
    return this.flagConfigurationStore.getKeys();
  }

  public isInitialized() {
    return (
      this.flagConfigurationStore.isInitialized() &&
      (!this.banditConfigurationStore || this.banditConfigurationStore.isInitialized())
    );
  }

  public setAssignmentLogger(logger: IAssignmentLogger) {
    this.assignmentLogger = logger;
    // log any assignment events that may have been queued while initializing
    this.flushQueuedEvents(this.queuedAssignmentEvents, this.assignmentLogger?.logAssignment);
  }

  public setBanditLogger(logger: IBanditLogger) {
    this.banditLogger = logger;
    // log any bandit events that may have been queued while initializing
    this.flushQueuedEvents(this.queuedBanditEvents, this.banditLogger?.logBanditAction);
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

  public useCustomAssignmentCache(cache: AssignmentCache) {
    this.assignmentCache = cache;
  }

  public setIsGracefulFailureMode(gracefulFailureMode: boolean) {
    this.isGracefulFailureMode = gracefulFailureMode;
  }

  private flushQueuedEvents<T>(eventQueue: T[], logFunction?: (event: T) => void) {
    const eventsToFlush = [...eventQueue]; // defensive copy
    eventQueue.length = 0; // Truncate the array

    if (!logFunction) {
      return;
    }

    eventsToFlush.forEach((event) => {
      try {
        logFunction(event);
      } catch (error) {
        logger.error(`[Eppo SDK] Error flushing event to logger: ${error.message}`);
      }
    });
  }

  private logAssignment(result: FlagEvaluation) {
    const { flagKey, subjectKey, allocationKey, subjectAttributes, variation } = result;
    const event: IAssignmentEvent = {
      ...(result.extraLogging ?? {}),
      allocation: allocationKey ?? null,
      experiment: allocationKey ? `${flagKey}-${allocationKey}` : null,
      featureFlag: flagKey,
      variation: variation?.key ?? null,
      subject: subjectKey,
      timestamp: new Date().toISOString(),
      subjectAttributes,
      metaData: this.buildLoggerMetadata(),
    };

    if (variation && allocationKey) {
      const hasLoggedAssignment = this.assignmentCache?.has({
        flagKey,
        subjectKey,
        allocationKey,
        variationKey: variation.key,
      });
      if (hasLoggedAssignment) {
        return;
      }
    }

    // assignment logger may be null while waiting for initialization
    if (this.assignmentLogger == null) {
      this.queuedAssignmentEvents.length < MAX_EVENT_QUEUE_SIZE &&
        this.queuedAssignmentEvents.push(event);
      return;
    }
    try {
      this.assignmentLogger.logAssignment(event);
      this.assignmentCache?.set({
        flagKey: flagKey,
        subjectKey: result.subjectKey,
        allocationKey: result.allocationKey ?? '__eppo_no_allocation',
        variationKey: result.variation?.key ?? '__eppo_no_variation',
      });
    } catch (error) {
      logger.error(`[Eppo SDK] Error logging assignment event: ${error.message}`);
    }
  }

  private buildLoggerMetadata(): Record<string, unknown> {
    return {
      obfuscated: this.isObfuscated,
      sdkLanguage: 'javascript',
      sdkLibVersion: LIB_VERSION,
    };
  }
}

export function checkTypeMatch(expectedType?: VariationType, actualType?: VariationType): boolean {
  return expectedType === undefined || actualType === expectedType;
}

export function checkValueTypeMatch(
  expectedType: VariationType | undefined,
  value: ValueType,
): boolean {
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
