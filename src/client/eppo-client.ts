import ApiEndpoints from '../api-endpoints';
import { logger } from '../application-logger';
import { IAssignmentEvent, IAssignmentLogger } from '../assignment-logger';
import {
  AssignmentCache,
  LRUInMemoryAssignmentCache,
  NonExpiringInMemoryAssignmentCache,
} from '../cache/abstract-assignment-cache';
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
import FlagConfigurationRequestor from '../flag-configuration-requestor';
import { FlagEvaluationDetails, FlagEvaluationDetailsBuilder } from '../flag-evaluation-details';
import FetchHttpClient from '../http-client';
import { Flag, ObfuscatedFlag, Variation, VariationType } from '../interfaces';
import { getMD5Hash } from '../obfuscation';
import initPoller, { IPoller } from '../poller';
import { AttributeType, ValueType } from '../types';
import { validateNotBlank } from '../validation';
import { LIB_VERSION } from '../version';

export interface AssignmentDetails<T extends Variation['value'] | object>
  extends FlagEvaluationDetails {
  value: T;
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

export default class EppoClient {
  private queuedEvents: IAssignmentEvent[] = [];
  private assignmentLogger?: IAssignmentLogger;
  private isGracefulFailureMode = true;
  private assignmentCache?: AssignmentCache;
  private requestPoller?: IPoller;
  private evaluator = new Evaluator();

  constructor(
    private configurationStore: IConfigurationStore<Flag | ObfuscatedFlag>,
    private configurationRequestParameters?: FlagConfigurationRequestParameters,
    private isObfuscated = false,
  ) {}

  public setConfigurationRequestParameters(
    configurationRequestParameters: FlagConfigurationRequestParameters,
  ) {
    this.configurationRequestParameters = configurationRequestParameters;
  }

  public setConfigurationStore(configurationStore: IConfigurationStore<Flag | ObfuscatedFlag>) {
    this.configurationStore = configurationStore;
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

    const isExpired = await this.configurationStore.isExpired();
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
    const configurationRequestor = new FlagConfigurationRequestor(
      this.configurationStore,
      httpClient,
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

  /**
   * Maps a subject to a string variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns a variation value if the subject is part of the experiment sample, otherwise the default value
   * @public
   */
  public getStringAssignment = (
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: string,
  ) => this.getStringAssignmentDetails(flagKey, subjectKey, subjectAttributes, defaultValue).value;

  /**
   * Maps a subject to a string variation for a given experiment and provides additional details about the
   * variation assigned and the reason for the assignment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns an object that includes the variation value along with additional metadata about the assignment
   * @public
   */
  public getStringAssignmentDetails(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: string,
  ): AssignmentDetails<string> {
    const { eppoValue, flagEvaluationDetails } = this.getAssignmentVariation(
      flagKey,
      subjectKey,
      subjectAttributes,
      EppoValue.String(defaultValue),
      VariationType.STRING,
    );
    return {
      value: eppoValue.stringValue ?? defaultValue,
      ...flagEvaluationDetails,
    };
  }

  /**
   * @deprecated use getBooleanAssignment instead.
   */
  public getBoolAssignment(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: boolean,
  ): boolean {
    return this.getBooleanAssignment(flagKey, subjectKey, subjectAttributes, defaultValue);
  }

  /**
   * Maps a subject to a boolean variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a boolean variation value if the subject is part of the experiment sample, otherwise the default value
   */
  public getBooleanAssignment = (
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: boolean,
  ) => this.getBooleanAssignmentDetails(flagKey, subjectKey, subjectAttributes, defaultValue).value;

  /**
   * Maps a subject to a boolean variation for a given experiment and provides additional details about the
   * variation assigned and the reason for the assignment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns an object that includes the variation value along with additional metadata about the assignment
   * @public
   */
  public getBooleanAssignmentDetails(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: boolean,
  ): AssignmentDetails<boolean> {
    const { eppoValue, flagEvaluationDetails } = this.getAssignmentVariation(
      flagKey,
      subjectKey,
      subjectAttributes,
      EppoValue.Bool(defaultValue),
      VariationType.BOOLEAN,
    );
    return {
      value: eppoValue.boolValue ?? defaultValue,
      ...flagEvaluationDetails,
    };
  }

  /**
   * Maps a subject to an Integer variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a boolean variation value if the subject is part of the experiment sample, otherwise the default value
   */
  public getIntegerAssignment = (
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: number,
  ) => this.getIntegerAssignmentDetails(flagKey, subjectKey, subjectAttributes, defaultValue).value;

  /**
   * Maps a subject to an Integer variation for a given experiment and provides additional details about the
   * variation assigned and the reason for the assignment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns an object that includes the variation value along with additional metadata about the assignment
   * @public
   */
  public getIntegerAssignmentDetails(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: number,
  ): AssignmentDetails<number> {
    const { eppoValue, flagEvaluationDetails } = this.getAssignmentVariation(
      flagKey,
      subjectKey,
      subjectAttributes,
      EppoValue.Numeric(defaultValue),
      VariationType.INTEGER,
    );
    return {
      value: eppoValue.numericValue ?? defaultValue,
      ...flagEvaluationDetails,
    };
  }

  /**
   * Maps a subject to a numeric variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a number variation value if the subject is part of the experiment sample, otherwise the default value
   */
  public getNumericAssignment = (
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: number,
  ) => this.getNumericAssignmentDetails(flagKey, subjectKey, subjectAttributes, defaultValue).value;

  /**
   * Maps a subject to a numeric variation for a given experiment and provides additional details about the
   * variation assigned and the reason for the assignment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns an object that includes the variation value along with additional metadata about the assignment
   * @public
   */
  public getNumericAssignmentDetails(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: number,
  ): AssignmentDetails<number> {
    const { eppoValue, flagEvaluationDetails } = this.getAssignmentVariation(
      flagKey,
      subjectKey,
      subjectAttributes,
      EppoValue.Numeric(defaultValue),
      VariationType.NUMERIC,
    );
    return {
      value: eppoValue.numericValue ?? defaultValue,
      ...flagEvaluationDetails,
    };
  }

  /**
   * Maps a subject to a JSON variation for a given experiment.
   *
   * @param flagKey feature flag identifier
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * @param defaultValue default value to return if the subject is not part of the experiment sample
   * @returns a JSON object variation value if the subject is part of the experiment sample, otherwise the default value
   */
  public getJSONAssignment = (
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: object,
  ) => this.getJSONAssignmentDetails(flagKey, subjectKey, subjectAttributes, defaultValue).value;

  public getJSONAssignmentDetails(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: object,
  ): AssignmentDetails<object> {
    const { eppoValue, flagEvaluationDetails } = this.getAssignmentVariation(
      flagKey,
      subjectKey,
      subjectAttributes,
      EppoValue.JSON(defaultValue),
      VariationType.JSON,
    );
    return {
      value: eppoValue.objectValue ?? defaultValue,
      ...flagEvaluationDetails,
    };
  }

  private getAssignmentVariation(
    flagKey: string,
    subjectKey: string,
    subjectAttributes: Record<string, AttributeType>,
    defaultValue: EppoValue,
    expectedVariationType: VariationType,
  ): { eppoValue: EppoValue; flagEvaluationDetails: FlagEvaluationDetails } {
    try {
      const result = this.getAssignmentDetail(
        flagKey,
        subjectKey,
        subjectAttributes,
        expectedVariationType,
      );

      if (!result.variation) {
        return {
          eppoValue: defaultValue,
          flagEvaluationDetails: result.flagEvaluationDetails,
        };
      }

      return {
        eppoValue: EppoValue.valueOf(result.variation.value, expectedVariationType),
        flagEvaluationDetails: result.flagEvaluationDetails,
      };
    } catch (error) {
      const eppoValue = this.rethrowIfNotGraceful(error, defaultValue);
      const flagEvaluationDetails = new FlagEvaluationDetailsBuilder().buildForNoneResult(
        'ASSIGNMENT_ERROR',
        `Assignment Error: ${error.message}`,
      );
      return {
        eppoValue,
        flagEvaluationDetails,
      };
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
    const flagEvaluationDetailsBuilder = new FlagEvaluationDetailsBuilder();

    if (flag === null) {
      logger.warn(`[Eppo SDK] No assigned variation. Flag not found: ${flagKey}`);
      // note: this is different from the Python SDK, which returns None instead
      const flagEvaluationDetails = flagEvaluationDetailsBuilder.buildForNoneResult(
        'FLAG_UNRECOGNIZED_OR_DISABLED',
        `Unrecognized or disabled flag: ${flagKey}`,
      );
      return noneResult(flagKey, subjectKey, subjectAttributes, flagEvaluationDetails);
    }

    if (!checkTypeMatch(expectedVariationType, flag.variationType)) {
      throw new TypeError(
        `Variation value does not have the correct type. Found: ${flag.variationType} != ${expectedVariationType} for flag ${flagKey}`,
      );
    }

    if (!flag.enabled) {
      logger.info(`[Eppo SDK] No assigned variation. Flag is disabled: ${flagKey}`);
      // note: this is different from the Python SDK, which returns None instead
      const flagEvaluationDetails = flagEvaluationDetailsBuilder.buildForNoneResult(
        'FLAG_UNRECOGNIZED_OR_DISABLED',
        `Unrecognized or disabled flag: ${flagKey}`,
      );
      return noneResult(flagKey, subjectKey, subjectAttributes, flagEvaluationDetails);
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
      const { key: vKey, value: vValue } = result.variation;
      const reason = `Expected variation type ${expectedVariationType} does not match for variation '${vKey}' with value ${vValue}`;
      const flagEvaluationDetails = flagEvaluationDetailsBuilder.buildForNoneResult(
        'TYPE_MISMATCH',
        reason,
      );
      return noneResult(flagKey, subjectKey, subjectAttributes, flagEvaluationDetails);
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
    return this.configurationStore.get(flagKey);
  }

  private getObfuscatedFlag(flagKey: string): Flag | null {
    const flag: ObfuscatedFlag | null = this.configurationStore.get(
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

  public useCustomAssignmentCache(cache: AssignmentCache) {
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
      logger.error(`[Eppo SDK] Error flushing assignment events: ${error.message}`);
    }
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
      metaData: {
        obfuscated: this.isObfuscated,
        sdkLanguage: 'javascript',
        sdkLibVersion: LIB_VERSION,
      },
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
      this.queuedEvents.length < MAX_EVENT_QUEUE_SIZE && this.queuedEvents.push(event);
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
