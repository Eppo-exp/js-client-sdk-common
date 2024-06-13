import { Allocation, Variation } from './interfaces';
import { Rule } from './rules';

export const flagEvaluationCodes = [
  'MATCH',
  'FLAG_UNRECOGNIZED_OR_DISABLED',
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
  orderPosition: number;
}

export interface FlagEvaluationDetails {
  variationKey: string | null;
  variationValue: Variation['value'] | null;
  flagEvaluationCode: FlagEvaluationCode;
  flagEvaluationDescription: string;
  matchedRule: Rule | null;
  matchedAllocation: AllocationEvaluation | null;
  unmatchedAllocations: Array<AllocationEvaluation>;
}

export class FlagEvaluationDetailsBuilder {
  private variationKey: FlagEvaluationDetails['variationKey'];
  private variationValue: FlagEvaluationDetails['variationValue'];
  private matchedRule: FlagEvaluationDetails['matchedRule'];
  private matchedAllocation: FlagEvaluationDetails['matchedAllocation'];
  private unmatchedAllocations: FlagEvaluationDetails['unmatchedAllocations'];

  constructor() {
    this.setNone();
  }

  setNone = (
    unmatchedAllocations: Array<AllocationEvaluation> = [],
  ): FlagEvaluationDetailsBuilder => {
    this.variationKey = null;
    this.variationValue = null;
    this.matchedAllocation = null;
    this.matchedRule = null;
    this.unmatchedAllocations = unmatchedAllocations;
    return this;
  };

  setMatch = (
    orderPosition: number,
    variation: Variation,
    allocation: Allocation,
    matchedRule: Rule | null,
    unmatchedAllocations: Array<AllocationEvaluation>,
  ): FlagEvaluationDetailsBuilder => {
    this.variationKey = variation.key;
    this.variationValue = variation.value;
    this.matchedRule = matchedRule;
    this.matchedAllocation = {
      key: allocation.key,
      allocationEvaluationCode: AllocationEvaluationCode.MATCH,
      orderPosition,
    };
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
    matchedRule: this.matchedRule,
    matchedAllocation: this.matchedAllocation,
    unmatchedAllocations: this.unmatchedAllocations,
  });
}
