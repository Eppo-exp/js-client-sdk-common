import { IAssignmentEvent } from './assignment-logger';
import { AllocationEvaluationCode } from './flag-evaluation-details-builder';

describe('IAssignmentEvent', () => {
  it('should allow adding arbitrary fields', () => {
    const event: IAssignmentEvent = {
      allocation: 'allocation_123',
      experiment: 'experiment_123',
      featureFlag: 'feature_flag_123',
      variation: 'variation_123',
      subject: 'subject_123',
      timestamp: new Date().toISOString(),
      subjectAttributes: { age: 25, country: 'USA' },
      holdoutKey: 'holdout_key_123',
      details: {
        variationKey: 'variationKey',
        variationValue: 'variation_123',
        flagEvaluationCode: 'MATCH',
        flagEvaluationDescription: '',
        configFetchedAt: new Date().toISOString(),
        configPublishedAt: new Date().toISOString(),
        matchedRule: null,
        matchedAllocation: {
          key: 'allocation_123',
          allocationEvaluationCode: AllocationEvaluationCode.MATCH,
          orderPosition: 1,
        },
        unmatchedAllocations: [],
        unevaluatedAllocations: [],
      },
    };

    expect(event.holdoutKey).toBe('holdout_key_123');
  });
});
