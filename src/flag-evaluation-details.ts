import { Allocation, Variation } from './interfaces';
import { Rule } from './rules';

export const flagEvaluationCodes = [
  'MATCH',
  'FLAG_DISABLED',
  'FLAG_NOT_FOUND',
  'TYPE_MISMATCH',
  'ASSIGNMENT_ERROR',
  'DEFAULT_ALLOCATION',
] as const;

export type FlagEvaluationCode = typeof flagEvaluationCodes[number];

export enum AllocationEvaluationCode {
  MATCH = 'MATCH',
  BEFORE_START_TIME = 'BEFORE_START_TIME',
  AFTER_END_TIME = 'AFTER_END_TIME',
  FAILING_RULE = 'FAILING_RULE',
  TRAFFIC_EXPOSURE_MISS = 'TRAFFIC_EXPOSURE_MISS',
}

export interface AllocationEvaluation {
  key: string;
  allocationEvaluationCode: AllocationEvaluationCode;
}

export interface FlagEvaluationDetails {
  variationKey: string | null;
  variationValue: Variation['value'] | null;
  flagEvaluationCode: FlagEvaluationCode;
  flagEvaluationDescription: string;
  lastConfigFetch: string;
  matchedAllocation: AllocationEvaluation | null;
  matchedRule: Rule | null;
  unmatchedAllocations: Array<AllocationEvaluation>;
}

export const createAllocationEvaluation = (
  allocationKey: string,
  allocationEvaluationCode: AllocationEvaluationCode,
): AllocationEvaluation => {
  return {
    key: allocationKey,
    allocationEvaluationCode,
  };
};

export class FlagEvaluationDetailsBuilder {
  private variationKey: FlagEvaluationDetails['variationKey'];
  private variationValue: FlagEvaluationDetails['variationValue'];
  private lastConfigFetch: FlagEvaluationDetails['lastConfigFetch'];
  private matchedAllocation: FlagEvaluationDetails['matchedAllocation'];
  private matchedRule: FlagEvaluationDetails['matchedRule'];
  private unmatchedAllocations: FlagEvaluationDetails['unmatchedAllocations'];

  constructor() {
    this.setNone();
  }

  setNone = (
    unmatchedAllocations: Array<AllocationEvaluation> = [],
  ): FlagEvaluationDetailsBuilder => {
    this.variationKey = null;
    this.variationValue = null;
    this.lastConfigFetch = ''; // TODO
    this.matchedAllocation = null;
    this.matchedRule = null;
    this.unmatchedAllocations = unmatchedAllocations;
    return this;
  };

  setMatch = (
    variation: Variation,
    allocation: Allocation,
    matchedRule: Rule | null,
    unmatchedAllocations: Array<AllocationEvaluation>,
  ): FlagEvaluationDetailsBuilder => {
    this.variationKey = variation.key;
    this.variationValue = variation.value;
    this.lastConfigFetch = ''; // TODO
    this.matchedAllocation = createAllocationEvaluation(
      allocation.key,
      AllocationEvaluationCode.MATCH,
    );
    this.matchedRule = matchedRule;
    this.unmatchedAllocations = unmatchedAllocations;
    return this;
  };

  buildForNoneResult = (
    flagEvaluationCode: FlagEvaluationCode,
    flagEvaluationDescription: string,
    unmatchedAllocations: Array<AllocationEvaluation> = [],
  ): FlagEvaluationDetails =>
    this.setNone(unmatchedAllocations).build(flagEvaluationCode, flagEvaluationDescription);

  build = (
    flagEvaluationCode: FlagEvaluationCode,
    flagEvaluationDescription: string,
  ): FlagEvaluationDetails => ({
    flagEvaluationCode,
    flagEvaluationDescription,
    variationKey: this.variationKey,
    variationValue: this.variationValue,
    lastConfigFetch: this.lastConfigFetch,
    matchedAllocation: this.matchedAllocation,
    matchedRule: this.matchedRule,
    unmatchedAllocations: this.unmatchedAllocations,
  });
}
