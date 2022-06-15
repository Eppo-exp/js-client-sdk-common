import { createHash } from 'crypto';

import { IExperimentConfiguration } from './experiment/experiment-configuration';
import ExperimentConfigurationRequestor from './experiment/experiment-configuration-requestor';
import { Rule } from './experiment/rule';
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
   * @param experimentKey experiment identifier
   * @returns a variation value if the subject is part of the experiment sample, otherwise null
   * @public
   */
  getAssignment(experimentKey: string): string;
}

export default class EppoClient implements IEppoClient {
  constructor(
    private subjectKey: string,
    private configurationRequestor: ExperimentConfigurationRequestor,
    private subjectAttributes = {},
  ) {}

  getAssignment(experimentKey: string): string {
    validateNotBlank(experimentKey, 'Invalid argument: experimentKey cannot be blank');
    const experimentConfig = this.configurationRequestor.getConfiguration(experimentKey);
    if (
      !experimentConfig?.enabled ||
      !this.subjectAttributesSatisfyRules(experimentConfig.rules) ||
      !this.isInExperimentSample(experimentKey, experimentConfig)
    ) {
      return null;
    }
    const override = this.getSubjectVariationOverride(experimentConfig);
    if (override) {
      return override;
    }
    const { variations, subjectShards } = experimentConfig;
    const shard = getShard(`assignment-${this.subjectKey}-${experimentKey}`, subjectShards);
    return variations.find((variation) => isShardInRange(shard, variation.shardRange)).name;
  }

  private subjectAttributesSatisfyRules(rules?: Rule[]) {
    if (!rules || rules.length === 0) {
      return true;
    }
    return matchesAnyRule(this.subjectAttributes || {}, rules);
  }

  private getSubjectVariationOverride(experimentConfig: IExperimentConfiguration): string {
    const subjectHash = createHash('md5').update(this.subjectKey).digest('hex');
    return experimentConfig.overrides[subjectHash];
  }

  /**
   * This checks whether the subject is included in the experiment sample.
   * It is used to determine whether the subject should be assigned to a variant.
   * Given a hash function output (bucket), check whether the bucket is between 0 and exposure_percent * total_buckets.
   */
  private isInExperimentSample(
    experimentKey: string,
    experimentConfig: IExperimentConfiguration,
  ): boolean {
    const { percentExposure, subjectShards } = experimentConfig;
    const shard = getShard(`exposure-${this.subjectKey}-${experimentKey}`, subjectShards);
    return shard <= percentExposure * subjectShards;
  }
}
