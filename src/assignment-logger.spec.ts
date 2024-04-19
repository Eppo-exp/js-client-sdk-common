import { IAssignmentEvent } from './assignment-logger';

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
    };

    expect(event.holdoutKey).toBe('holdout_key_123');
  });
});
