import { Allocation, Variation, VariationType } from './interfaces';
import { Rule } from './rules';

export const flagEvaluationCodes = [
  'MATCH',
  'FLAG_UNRECOGNIZED_OR_DISABLED',
  'TYPE_MISMATCH',
  'ASSIGNMENT_ERROR',
  'DEFAULT_ALLOCATION_NULL',
  'NO_BANDIT_ACTIONS_SUPPLIED',
] as const;

export type FlagEvaluationCode = typeof flagEvaluationCodes[number];

export enum AllocationEvaluationCode {
  UNEVALUATED = 'UNEVALUATED',
  MATCH = 'MATCH',
  BEFORE_START_TIME = 'BEFORE_START_TIME',
  TRAFFIC_EXPOSURE_MISS = 'TRAFFIC_EXPOSURE_MISS',
  AFTER_END_TIME = 'AFTER_END_TIME',
  FAILING_RULE = 'FAILING_RULE',
}

export interface AllocationEvaluation {
  key: string;
  allocationEvaluationCode: AllocationEvaluationCode;
  orderPosition: number;
}

export interface IFlagEvaluationDetails {
  environmentName: string;
  variationKey: string | null;
  variationValue: Variation['value'] | null;
  flagEvaluationCode: FlagEvaluationCode;
  flagEvaluationDescription: string;
  configFetchedAt: string;
  configPublishedAt: string;
  matchedRule: Rule | null;
  matchedAllocation: AllocationEvaluation | null;
  unmatchedAllocations: Array<AllocationEvaluation>;
  unevaluatedAllocations: Array<AllocationEvaluation>;
}

export class FlagEvaluationDetailsBuilder {
  private variationKey: IFlagEvaluationDetails['variationKey'];
  private variationValue: IFlagEvaluationDetails['variationValue'];
  private matchedRule: IFlagEvaluationDetails['matchedRule'];
  private matchedAllocation: IFlagEvaluationDetails['matchedAllocation'];
  private unmatchedAllocations: IFlagEvaluationDetails['unmatchedAllocations'];
  private unevaluatedAllocations: IFlagEvaluationDetails['unevaluatedAllocations'];

  constructor(
    private readonly environmentName: string,
    private readonly allocations: Allocation[],
    private readonly configFetchedAt: string,
    private readonly configPublishedAt: string,
  ) {
    this.setNone();
  }

  setNone = (): FlagEvaluationDetailsBuilder => {
    this.variationKey = null;
    this.variationValue = null;
    this.matchedAllocation = null;
    this.matchedRule = null;
    this.unmatchedAllocations = [];
    this.unevaluatedAllocations = this.allocations.map(
      (allocation, i): AllocationEvaluation => ({
        key: allocation.key,
        allocationEvaluationCode: AllocationEvaluationCode.UNEVALUATED,
        orderPosition: i + 1,
      }),
    );
    return this;
  };

  setNoMatchFound = (
    unmatchedAllocations: Array<AllocationEvaluation> = [],
  ): FlagEvaluationDetailsBuilder => {
    this.variationKey = null;
    this.variationValue = null;
    this.matchedAllocation = null;
    this.matchedRule = null;
    this.unmatchedAllocations = unmatchedAllocations;
    this.unevaluatedAllocations = [];
    return this;
  };

  setMatch = (
    indexPosition: number,
    variation: Variation,
    allocation: Allocation,
    matchedRule: Rule | null,
    unmatchedAllocations: Array<AllocationEvaluation>,
    expectedVariationType: VariationType | undefined,
  ): FlagEvaluationDetailsBuilder => {
    this.variationKey = variation.key;
    // variation.value needs to be parsed into a JSON object if the variation type is JSON
    // or else it will just remain a string
    this.variationValue =
      expectedVariationType === VariationType.JSON && typeof variation.value === 'string'
        ? JSON.parse(variation.value)
        : variation.value;
    this.matchedRule = matchedRule;
    this.matchedAllocation = {
      key: allocation.key,
      allocationEvaluationCode: AllocationEvaluationCode.MATCH,
      orderPosition: indexPosition + 1, // orderPosition is 1-indexed to match UI
    };
    this.unmatchedAllocations = unmatchedAllocations;
    const unevaluatedStartIndex = indexPosition + 1;
    const unevaluatedStartOrderPosition = unevaluatedStartIndex + 1; // orderPosition is 1-indexed to match UI
    this.unevaluatedAllocations = this.allocations.slice(unevaluatedStartIndex).map(
      (allocation, i) =>
        ({
          key: allocation.key,
          allocationEvaluationCode: AllocationEvaluationCode.UNEVALUATED,
          orderPosition: unevaluatedStartOrderPosition + i,
        } as AllocationEvaluation),
    );
    return this;
  };

  buildForNoneResult = (
    flagEvaluationCode: FlagEvaluationCode,
    flagEvaluationDescription: string,
  ): IFlagEvaluationDetails => this.setNone().build(flagEvaluationCode, flagEvaluationDescription);

  build = (
    flagEvaluationCode: FlagEvaluationCode,
    flagEvaluationDescription: string,
  ): IFlagEvaluationDetails => ({
    environmentName: this.environmentName,
    flagEvaluationCode,
    flagEvaluationDescription,
    variationKey: this.variationKey,
    variationValue: this.variationValue,
    configFetchedAt: this.configFetchedAt,
    configPublishedAt: this.configPublishedAt,
    matchedRule: this.matchedRule,
    matchedAllocation: this.matchedAllocation,
    unmatchedAllocations: this.unmatchedAllocations,
    unevaluatedAllocations: this.unevaluatedAllocations,
  });
}
