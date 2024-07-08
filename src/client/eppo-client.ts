import ApiEndpoints from '../api-endpoints';
import { logger } from '../application-logger';
import { IAssignmentEvent, IAssignmentLogger } from '../assignment-logger';
import { BanditEvaluator } from '../bandit-evaluator';
import { IBanditEvent, IBanditLogger } from '../bandit-logger';
import {
  AssignmentCache,
  LRUInMemoryAssignmentCache,
  NonExpiringInMemoryAssignmentCache,
} from '../cache/abstract-assignment-cache';
import ConfigurationRequestor from '../configuration-requestor';
import { IConfigurationStore } from '../configuration-store/configuration-store';
import {
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
import {
  BanditVariation,
  BanditParameters,
  Flag,
  ObfuscatedFlag,
  VariationType,
} from '../interfaces';
import { getMD5Hash } from '../obfuscation';
import initPoller, { IPoller } from '../poller';
import {
  Attributes,
  AttributeType,
  BanditActions,
  BanditSubjectAttributes,
  ContextAttributes,
  ValueType,
} from '../types';
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
    subjectAttributes: Attributes,
    defaultValue: string,
  ): string;

  /**
   * @deprecated use getBooleanAssignment instead.
   */
  getBoolAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Attributes,
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
    subjectAttributes: Attributes,
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
    subjectAttributes: Attributes,
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
    subjectAttributes: Attributes,
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
    subjectAttributes: Attributes,
    defaultValue: object,
  ): object;

  /**
   * Maps a subject to a string assignment for a given experiment.
   * This variation may be a bandit-selected action.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional (can be empty) attributes associated with the subject, for example name and email.
   * @param actions possible attributes and their optional (can be empty) attributes to be evaluated by a contextual,
   * multi-armed bandit--if one is assigned to the subject.
   * @param defaultValue default value to return if the subject is not part of the experiment sample,
   * there are no bandit actions, or an error is countered evaluating the feature flag or bandit action */
  getBanditAction(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: BanditSubjectAttributes,
    actions: BanditActions,
    defaultValue: string,
  ): { variation: string; action: string | null };

  /** @Deprecated Renamed to setAssignmentLogger for clarity */
  setLogger(logger: IAssignmentLogger): void;

  setAssignmentLogger(assignmentLogger: IAssignmentLogger): void;

  setBanditLogger(banditLogger: IBanditLogger): void;

  useLRUInMemoryAssignmentCache(maxSize: number): void;

  useCustomAssignmentCache(cache: AssignmentCache): void;

  setConfigurationRequestParameters(
    configurationRequestParameters: FlagConfigurationRequestParameters,
  ): void;

  setFlagConfigurationStore(configurationStore: IConfigurationStore<Flag | ObfuscatedFlag>): void;

  setBanditVariationConfigurationStore(
    banditVariationConfigurationStore: IConfigurationStore<BanditVariation[]>,
  ): void;

  setBanditModelConfigurationStore(
    banditModelConfigurationStore: IConfigurationStore<BanditParameters>,
  ): void;

  setIsObfuscated(isObfuscated: boolean): void;

  fetchFlagConfigurations(): void;

  stopPolling(): void;

  setIsGracefulFailureMode(gracefulFailureMode: boolean): void;

  getFlagKeys(): string[];

  getFlagConfigurations(): Record<string, Flag>;

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
  private readonly queuedAssignmentEvents: IAssignmentEvent[] = [];
  private assignmentLogger?: IAssignmentLogger;
  private readonly queuedBanditEvents: IBanditEvent[] = [];
  private banditLogger?: IBanditLogger;
  private isGracefulFailureMode = true;
  private assignmentCache?: AssignmentCache;
  private requestPoller?: IPoller;
  private readonly evaluator = new Evaluator();
  private readonly banditEvaluator = new BanditEvaluator();

  constructor(
    private flagConfigurationStore: IConfigurationStore<Flag | ObfuscatedFlag>,
    private banditVariationConfigurationStore?: IConfigurationStore<BanditVariation[]>,
    private banditModelConfigurationStore?: IConfigurationStore<BanditParameters>,
    private configurationRequestParameters?: FlagConfigurationRequestParameters,
    private isObfuscated = false,
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

  public setBanditVariationConfigurationStore(
    banditVariationConfigurationStore: IConfigurationStore<BanditVariation[]>,
  ) {
    this.banditVariationConfigurationStore = banditVariationConfigurationStore;
  }

  public setBanditModelConfigurationStore(
    banditModelConfigurationStore: IConfigurationStore<BanditParameters>,
  ) {
    this.banditModelConfigurationStore = banditModelConfigurationStore;
  }

  public setIsObfuscated(isObfuscated: boolean) {
    this.isObfuscated = isObfuscated;
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
      baseUrl, // Default is set in ApiEndpoints constructor if undefined
      requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
      numInitialRequestRetries = DEFAULT_INITIAL_CONFIG_REQUEST_RETRIES,
      numPollRequestRetries = DEFAULT_POLL_CONFIG_REQUEST_RETRIES,
      pollAfterSuccessfulInitialization = false,
      pollAfterFailedInitialization = false,
      throwOnFailedInitialization = false,
      skipInitialPoll = false,
    } = this.configurationRequestParameters;
    // todo: Inject the chain of dependencies below
    const apiEndpoints = new ApiEndpoints({
      baseUrl,
      queryParams: { apiKey, sdkName, sdkVersion },
    });
    const httpClient = new FetchHttpClient(apiEndpoints, requestTimeoutMs);
    const configurationRequestor = new ConfigurationRequestor(
      httpClient,
      this.flagConfigurationStore,
      this.banditVariationConfigurationStore ?? null,
      this.banditModelConfigurationStore ?? null,
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
    subjectAttributes: Attributes,
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
    subjectAttributes: Attributes,
    defaultValue: boolean,
  ): boolean {
    return this.getBooleanAssignment(flagKey, subjectKey, subjectAttributes, defaultValue);
  }

  public getBooleanAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Attributes,
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
    subjectAttributes: Attributes,
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
    subjectAttributes: Attributes,
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
    subjectAttributes: Attributes,
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
    subjectAttributes: BanditSubjectAttributes,
    actions: BanditActions,
    defaultValue: string,
  ): { variation: string; action: string | null } {
    const defaultResult = { variation: defaultValue, action: null };
    let variation = defaultValue;
    let action: string | null = null;
    try {
      const banditVariations = this.banditVariationConfigurationStore?.get(flagKey);
      if (banditVariations && !Object.keys(actions).length) {
        // No actions passed for a flag known to have an active bandit, so we just return the default values so that
        // we don't log a variation or bandit assignment
        return defaultResult;
      }

      // Get the assigned variation for the flag with a possible bandit
      // Note for getting assignments, we don't care about context
      const nonContextualSubjectAttributes =
        this.ensureNonContextualSubjectAttributes(subjectAttributes);
      variation = this.getStringAssignment(
        flagKey,
        subjectKey,
        nonContextualSubjectAttributes,
        defaultValue,
      );

      // Check if the assigned variation is an active bandit
      // Note: the reason for non-bandit assignments include the subject being bucketed into a non-bandit variation or
      // a rollout having been done.
      const banditKey = banditVariations?.find(
        (banditVariation) => banditVariation.variationValue === variation,
      )?.key;

      if (banditKey) {
        // Retrieve the model parameters for the bandit
        const banditParameters = this.banditModelConfigurationStore?.get(banditKey);

        if (!banditParameters) {
          throw new Error('No model parameters for bandit ' + banditKey);
        }

        const banditModelData = banditParameters.modelData;
        const contextualSubjectAttributes =
          this.ensureContextualSubjectAttributes(subjectAttributes);
        const actionsWithContextualAttributes = this.ensureActionsWithContextualAttributes(actions);
        const banditEvaluation = this.banditEvaluator.evaluateBandit(
          flagKey,
          subjectKey,
          contextualSubjectAttributes,
          actionsWithContextualAttributes,
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
          subjectNumericAttributes: contextualSubjectAttributes.numericAttributes,
          subjectCategoricalAttributes: contextualSubjectAttributes.categoricalAttributes,
          actionNumericAttributes: actionsWithContextualAttributes[action].numericAttributes,
          actionCategoricalAttributes:
            actionsWithContextualAttributes[action].categoricalAttributes,
          metaData: this.buildLoggerMetadata(),
        };
        this.logBanditAction(banditEvent);
      }
    } catch (err) {
      logger.error('Error evaluating bandit action', err);
      if (!this.isGracefulFailureMode) {
        throw err;
      }
      return defaultResult;
    }

    return { variation, action };
  }

  private ensureNonContextualSubjectAttributes(
    subjectAttributes: BanditSubjectAttributes,
  ): Attributes {
    let result: Attributes;
    if (this.isInstanceOfContextualAttributes(subjectAttributes)) {
      const contextualSubjectAttributes = subjectAttributes as ContextAttributes;
      result = {
        ...contextualSubjectAttributes.numericAttributes,
        ...contextualSubjectAttributes.categoricalAttributes,
      };
    } else {
      // Attributes are non-contextual
      result = subjectAttributes as Attributes;
    }
    return result;
  }

  private ensureContextualSubjectAttributes(
    subjectAttributes: BanditSubjectAttributes,
  ): ContextAttributes {
    let result: ContextAttributes;
    if (this.isInstanceOfContextualAttributes(subjectAttributes)) {
      result = subjectAttributes as ContextAttributes;
    } else {
      result = this.deduceAttributeContext(subjectAttributes as Attributes);
    }
    return result;
  }

  private ensureActionsWithContextualAttributes(
    actions: BanditActions,
  ): Record<string, ContextAttributes> {
    let result: Record<string, ContextAttributes> = {};
    if (Array.isArray(actions)) {
      // no context
      actions.forEach((action) => {
        result[action] = { numericAttributes: {}, categoricalAttributes: {} };
      });
    } else if (!Object.values(actions).every(this.isInstanceOfContextualAttributes)) {
      // Actions have non-contextual attributes; bucket based on number or not
      Object.entries(actions).forEach(([action, attributes]) => {
        result[action] = this.deduceAttributeContext(attributes);
      });
    } else {
      // Actions already have contextual attributes
      result = actions as Record<string, ContextAttributes>;
    }
    return result;
  }

  private isInstanceOfContextualAttributes(attributes: unknown): boolean {
    return Boolean(
      typeof attributes === 'object' &&
        attributes && // exclude null
        'numericAttributes' in attributes &&
        'categoricalAttributes' in attributes,
    );
  }

  private deduceAttributeContext(attributes: Attributes): ContextAttributes {
    const contextualAttributes: ContextAttributes = {
      numericAttributes: {},
      categoricalAttributes: {},
    };
    Object.entries(attributes).forEach(([attribute, value]) => {
      const isNumeric = typeof value === 'number' && isFinite(value);
      if (isNumeric) {
        contextualAttributes.numericAttributes[attribute] = value;
      } else {
        contextualAttributes.categoricalAttributes[attribute] = value as AttributeType;
      }
    });
    return contextualAttributes;
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

  private getAssignmentVariation(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Attributes,
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
    subjectAttributes: Attributes = {},
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
     * Note that it is generally not a good idea to preload all flag configurations.
     */
    return this.flagConfigurationStore.getKeys();
  }

  public isInitialized() {
    return (
      this.flagConfigurationStore.isInitialized() &&
      (!this.banditVariationConfigurationStore ||
        this.banditVariationConfigurationStore.isInitialized()) &&
      (!this.banditModelConfigurationStore || this.banditModelConfigurationStore.isInitialized())
    );
  }

  /** @deprecated Renamed to setAssignmentLogger */
  public setLogger(logger: IAssignmentLogger) {
    this.setAssignmentLogger(logger);
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

  public getFlagConfigurations(): Record<string, Flag> {
    return this.flagConfigurationStore.entries();
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
    if (!this.assignmentLogger) {
      this.queuedAssignmentEvents.length < MAX_EVENT_QUEUE_SIZE &&
        this.queuedAssignmentEvents.push(event);
      return;
    }
    try {
      this.assignmentLogger.logAssignment(event);
      this.assignmentCache?.set({
        flagKey,
        subjectKey,
        allocationKey: allocationKey ?? '__eppo_no_allocation',
        variationKey: variation?.key ?? '__eppo_no_variation',
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
