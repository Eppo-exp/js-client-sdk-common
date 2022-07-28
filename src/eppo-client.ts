import * as md5 from 'md5';

import { IAssignmentEvent, IAssignmentLogger } from './assignment-logger';
import { MAX_EVENT_QUEUE_SIZE, NULL_SENTINEL, SESSION_ASSIGNMENT_CONFIG_LOADED } from './constants';
import { IExperimentConfiguration } from './experiment/experiment-configuration';
import { EppoLocalStorage } from './local-storage';
import { Rule } from './rule';
import { matchesAnyRule } from './rule_evaluator';
import { EppoSessionStorage } from './session-storage';
import { getShard, isShardInRange } from './shard';
import { validateNotBlank } from './validation';

/**
 * Client for assigning experiment variations.
 * @public
 */
export interface IEppoClient {
  /**
   * Maps a subject to a variation for a given experiment.
   *
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param experimentKey experiment identifier
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns a variation value if the subject is part of the experiment sample, otherwise null
   * @public
   */
  getAssignment(
    subjectKey: string,
    experimentKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes?: Record<string, any>,
  ): string;
}

export default class EppoClient implements IEppoClient {
  public static instance: EppoClient = new EppoClient(
    new EppoLocalStorage(),
    new EppoSessionStorage(),
  );

  private queuedEvents: IAssignmentEvent[] = [];
  private assignmentLogger: IAssignmentLogger = null;

  constructor(
    private configurationStore: EppoLocalStorage,
    private sessionStorage: EppoSessionStorage,
  ) {}

  getAssignment(subjectKey: string, experimentKey: string, subjectAttributes = {}): string {
    validateNotBlank(subjectKey, 'Invalid argument: subjectKey cannot be blank');
    validateNotBlank(experimentKey, 'Invalid argument: experimentKey cannot be blank');
    // If getAssignment was called when the latest configuration were still being downloaded
    // use the old assignment for the remainder of the session to avoid a flickering effect;
    // we don't want a subject to switch between 2 variations during the same session.
    const sessionOverrideKey = `${subjectKey}-${experimentKey}-session-override`;
    const sessionOverride = this.sessionStorage.get(sessionOverrideKey);
    if (sessionOverride) {
      if (sessionOverride === NULL_SENTINEL) {
        return null;
      }
      this.logAssignment(experimentKey, sessionOverride, subjectKey, subjectAttributes);
      return sessionOverride;
    }
    const experimentConfig = this.configurationStore.get<IExperimentConfiguration>(experimentKey);
    const allowListOverride = this.getSubjectVariationOverride(subjectKey, experimentConfig);
    if (allowListOverride) {
      this.setSessionOverrideIfLoadingConfigurations(sessionOverrideKey, allowListOverride);
      return allowListOverride;
    }
    if (
      !experimentConfig?.enabled ||
      !this.subjectAttributesSatisfyRules(subjectAttributes, experimentConfig.rules) ||
      !this.isInExperimentSample(subjectKey, experimentKey, experimentConfig)
    ) {
      this.setSessionOverrideIfLoadingConfigurations(sessionOverrideKey, NULL_SENTINEL);
      return null;
    }
    const { variations, subjectShards } = experimentConfig;
    const shard = getShard(`assignment-${subjectKey}-${experimentKey}`, subjectShards);
    const assignedVariation = variations.find((variation) =>
      isShardInRange(shard, variation.shardRange),
    ).name;
    this.logAssignment(experimentKey, assignedVariation, subjectKey, subjectAttributes);
    this.setSessionOverrideIfLoadingConfigurations(sessionOverrideKey, assignedVariation);
    return assignedVariation;
  }

  public setLogger(logger: IAssignmentLogger) {
    this.assignmentLogger = logger;
    this.flushQueuedEvents(); // log any events that may have been queued while initializing
  }

  private flushQueuedEvents() {
    const eventsToFlush = this.queuedEvents;
    this.queuedEvents = [];
    try {
      for (const event of eventsToFlush) {
        this.assignmentLogger.logAssignment(event);
      }
    } catch (error) {
      console.error(`[Eppo SDK] Error flushing assignment events: ${error.message}`);
    }
  }

  private logAssignment(
    experiment: string,
    variation: string,
    subjectKey: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectAttributes: Record<string, any>,
  ) {
    const event: IAssignmentEvent = {
      experiment,
      variation,
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
    } catch (error) {
      console.error(`[Eppo SDK] Error logging assignment event: ${error.message}`);
    }
  }

  private setSessionOverrideIfLoadingConfigurations(overrideKey: string, assignmentValue: string) {
    if (this.sessionStorage.get(SESSION_ASSIGNMENT_CONFIG_LOADED) !== 'true') {
      this.sessionStorage.set(overrideKey, assignmentValue);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private subjectAttributesSatisfyRules(subjectAttributes?: Record<string, any>, rules?: Rule[]) {
    if (!rules || rules.length === 0) {
      return true;
    }
    return matchesAnyRule(subjectAttributes || {}, rules);
  }

  private getSubjectVariationOverride(
    subjectKey: string,
    experimentConfig: IExperimentConfiguration,
  ): string {
    const subjectHash = md5(subjectKey);
    return experimentConfig?.overrides[subjectHash];
  }

  /**
   * This checks whether the subject is included in the experiment sample.
   * It is used to determine whether the subject should be assigned to a variant.
   * Given a hash function output (bucket), check whether the bucket is between 0 and exposure_percent * total_buckets.
   */
  private isInExperimentSample(
    subjectKey: string,
    experimentKey: string,
    experimentConfig: IExperimentConfiguration,
  ): boolean {
    const { percentExposure, subjectShards } = experimentConfig;
    const shard = getShard(`exposure-${subjectKey}-${experimentKey}`, subjectShards);
    return shard <= percentExposure * subjectShards;
  }
}
