import { createHash } from 'crypto';

import { IExperimentConfiguration } from './experiment/experiment-configuration';
import ExperimentConfigurationRequestor from './experiment/experiment-configuration-requestor';
import { Rule } from './rule';
import { matchesAnyRule } from './rule_evaluator';
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
  constructor(private configurationRequestor: ExperimentConfigurationRequestor) {}

  getAssignment(subjectKey: string, experimentKey: string, subjectAttributes = {}): string {
    validateNotBlank(subjectKey, 'Invalid argument: subjectKey cannot be blank');
    validateNotBlank(experimentKey, 'Invalid argument: experimentKey cannot be blank');
    const experimentConfig = this.configurationRequestor.getConfiguration(experimentKey);
    if (
      !experimentConfig?.enabled ||
      !this.subjectAttributesSatisfyRules(subjectAttributes, experimentConfig.rules) ||
      !this.isInExperimentSample(subjectKey, experimentKey, experimentConfig)
    ) {
      return null;
    }
    const override = this.getSubjectVariationOverride(subjectKey, experimentConfig);
    if (override) {
      return override;
    }
    const { variations, subjectShards } = experimentConfig;
    const shard = getShard(`assignment-${subjectKey}-${experimentKey}`, subjectShards);
    return variations.find((variation) => isShardInRange(shard, variation.shardRange)).name;
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
    const subjectHash = createHash('md5').update(subjectKey).digest('hex');
    return experimentConfig.overrides[subjectHash];
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
