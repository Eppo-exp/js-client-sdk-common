import * as md5 from 'md5';

import { IAssignmentHooks } from '../assignment-hooks';
import { IAssignmentEvent, IAssignmentLogger } from '../assignment-logger';
import { IConfigurationStore } from '../configuration-store';
import { MAX_EVENT_QUEUE_SIZE } from '../constants';
import { IAllocation } from '../dto/allocation-dto';
import { IExperimentConfiguration } from '../dto/experiment-configuration-dto';
import { findMatchingRule } from '../rule_evaluator';
import { getShard, isShardInRange } from '../shard';
import { validateNotBlank } from '../validation';
import { Value } from '../value';

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
    subjectAttributes?: Record<string, Value>,
  ): string | null;

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
  getStringAssignment(
    subjectKey: string,
    experimentKey: string,
    subjectAttributes?: Record<string, Value>,
  ): string | null;

  getBoolAssignment(
    subjectKey: string,
    experimentKey: string,
    subjectAttributes?: Record<string, Value>,
  ): boolean | null;

  getNumericAssignment(
    subjectKey: string,
    experimentKey: string,
    subjectAttributes?: Record<string, Value>,
  ): number | null;

  /**
   * Asynchronously maps a subject to a variation for a given experiment, with pre and post assignment hooks
   *
   * @param subjectKey an identifier of the experiment subject, for example a user ID.
   * @param experimentKey experiment identifier
   * @param assignmentHooks interface for pre and post assignment hooks
   * @param subjectAttributes optional attributes associated with the subject, for example name and email.
   * The subject attributes are used for evaluating any targeting rules tied to the experiment.
   * @returns a variation value if the subject is part of the experiment sample, otherwise null
   * @public
   */
  getAssignmentWithHooks(
    subjectKey: string,
    experimentKey: string,
    assignmentHooks: IAssignmentHooks,
    subjectAttributes?: Record<string, Value>,
  ): Promise<Value>;
}

export default class EppoClient implements IEppoClient {
  private queuedEvents: IAssignmentEvent[] = [];
  private assignmentLogger?: IAssignmentLogger = undefined;

  constructor(private configurationStore: IConfigurationStore) {}

  public getAssignment(
    subjectKey: string,
    experimentKey: string,
    subjectAttributes = {},
  ): string | null {
    return this.getStringAssignment(subjectKey, experimentKey, subjectAttributes);
  }

  public getBoolAssignment(
    subjectKey: string,
    experimentKey: string,
    subjectAttributes = {},
  ): boolean | null {
    return this.getTypedAssignment(subjectKey, experimentKey, subjectAttributes).boolValue ?? null;
  }

  public getNumericAssignment(
    subjectKey: string,
    experimentKey: string,
    subjectAttributes = {},
  ): number | null {
    return (
      this.getTypedAssignment(subjectKey, experimentKey, subjectAttributes).numericValue ?? null
    );
  }

  public getStringAssignment(
    subjectKey: string,
    experimentKey: string,
    subjectAttributes = {},
  ): string | null {
    return (
      this.getTypedAssignment(subjectKey, experimentKey, subjectAttributes).stringValue ?? null
    );
  }

  private getTypedAssignment(
    subjectKey: string,
    experimentKey: string,
    subjectAttributes = {},
  ): Value {
    validateNotBlank(subjectKey, 'Invalid argument: subjectKey cannot be blank');
    validateNotBlank(experimentKey, 'Invalid argument: experimentKey cannot be blank');

    const experimentConfig = this.configurationStore.get<IExperimentConfiguration>(experimentKey);
    const allowListOverride = this.getSubjectVariationOverride(subjectKey, experimentConfig);

    if (!allowListOverride.isNull()) {
      return allowListOverride;
    }

    // Check for disabled flag.
    if (!experimentConfig?.enabled) return Value.Null();

    // Attempt to match a rule from the list.
    const matchedRule = findMatchingRule(subjectAttributes || {}, experimentConfig.rules);
    if (!matchedRule) return Value.Null();

    // Check if subject is in allocation sample.
    if (!matchedRule.allocationKey) return Value.Null();
    const allocation = experimentConfig.allocations[matchedRule.allocationKey];

    if (!this.isInExperimentSample(subjectKey, experimentKey, experimentConfig, allocation))
      return Value.Null();

    // Compute variation for subject.
    const { subjectShards } = experimentConfig;
    const { variations } = allocation;

    const shard = getShard(`assignment-${subjectKey}-${experimentKey}`, subjectShards);
    const assignedVariation = variations.find((variation) =>
      isShardInRange(shard, variation.shardRange),
    )?.typedValue;

    // Finally, log assignment and return assignment.
    if (!assignedVariation) return Value.Null();
    const typedAssignedVariation = Value.String(assignedVariation as string);
    this.logAssignment(experimentKey, typedAssignedVariation, subjectKey, subjectAttributes);
    return typedAssignedVariation;
  }

  // todo: typed assignment hooks?
  async getAssignmentWithHooks(
    subjectKey: string,
    experimentKey: string,
    assignmentHooks: IAssignmentHooks,
    subjectAttributes = {},
  ): Promise<Value> {
    let assignment: Value = await assignmentHooks?.onPreAssignment(subjectKey);

    if (assignment == Value.Null()) {
      assignment = this.getTypedAssignment(subjectKey, experimentKey, subjectAttributes);
    }

    assignmentHooks?.onPostAssignment(assignment);

    return assignment;
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
        this.assignmentLogger?.logAssignment(event);
      }
    } catch (error) {
      console.error(`[Eppo SDK] Error flushing assignment events: ${error.message}`);
    }
  }

  private logAssignment(
    experiment: string,
    variation: Value,
    subjectKey: string,
    subjectAttributes: Record<string, Value>,
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

  private getSubjectVariationOverride(
    subjectKey: string,
    experimentConfig: IExperimentConfiguration,
  ): Value {
    const subjectHash = md5(subjectKey);
    const overridden = experimentConfig?.typedOverrides[subjectHash];
    if (overridden) {
      return Value.String(overridden as string);
    }

    return Value.Null();
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
    allocation: IAllocation,
  ): boolean {
    const { subjectShards } = experimentConfig;
    const { percentExposure } = allocation;
    const shard = getShard(`exposure-${subjectKey}-${experimentKey}`, subjectShards);
    return shard <= percentExposure * subjectShards;
  }
}
