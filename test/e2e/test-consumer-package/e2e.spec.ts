import { init, getInstance } from '@eppo/js-client-sdk';

describe('e2e test', () => {
  it('should retrieve the assignment for a basic key', async () => {
    await init({
      apiKey: process.env.EPPO_FEATURE_FLAG_API_KEY as string,
      assignmentLogger: {
        logAssignment(assignment) {
          console.log('TODO: log', assignment);
        },
      },
    });
    const eppoClient = getInstance();
    const value = eppoClient.getStringAssignment('gregs-test-flag', 'tester-123', {}, '');
    expect(value).toBe('test');
  });
});
