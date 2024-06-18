import {
  readMockUFCResponse,
  MOCK_BANDIT_MODELS_RESPONSE_FILE,
  MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE,
  readBanditTestData,
  BanditTestCase,
} from '../../test/testHelpers';
import ApiEndpoints from '../api-endpoints';
import ConfigurationRequestor from '../configuration-requestor';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import FetchHttpClient from '../http-client';
import { BanditParameters, Flag } from '../interfaces';
import { Attributes } from '../types';

import EppoClient from './eppo-client';

describe('EppoClient Bandits E2E test', () => {
  const flagStore = new MemoryOnlyConfigurationStore<Flag>();
  const banditStore = new MemoryOnlyConfigurationStore<BanditParameters>();
  let client: EppoClient;

  beforeAll(async () => {
    // Mock out fetch to return the bandit flag configuration and model parameters
    global.fetch = jest.fn((url: string) => {
      const responseFile = url.includes('bandits')
        ? MOCK_BANDIT_MODELS_RESPONSE_FILE
        : MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE;
      const response = readMockUFCResponse(responseFile);

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(response),
      });
    }) as jest.Mock;

    // Initialize a configuration requestor
    const apiEndpoints = new ApiEndpoints('http://127.0.0.1:4000', {
      apiKey: 'dummy',
      sdkName: 'js-client-sdk-common',
      sdkVersion: '1.0.0',
    });
    const httpClient = new FetchHttpClient(apiEndpoints, 1000);
    const configurationRequestor = new ConfigurationRequestor(httpClient, flagStore, banditStore);
    await configurationRequestor.fetchAndStoreConfigurations();
  });

  beforeEach(() => {
    client = new EppoClient(flagStore, banditStore);
    client.setIsGracefulFailureMode(false);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('Shared test data', () => {
    const testData = readBanditTestData();
    // Build a map for more useful test names
    const testsByFlagKey: Record<string, BanditTestCase> = {};
    testData.forEach((testCase) => (testsByFlagKey[testCase.flag] = testCase));

    it.each(Object.keys(testsByFlagKey))(
      'Shared bandit test data - %s',
      async (flagKey: string) => {
        const { defaultValue, subjects } = testsByFlagKey[flagKey];
        let numAssignmentsChecked = 0;
        subjects.forEach((subject) => {
          // TODO: handle already-bucketed attributes
          // TODO: common test case with a numeric value passed as a categorical attribute and vice verse

          const actions: Record<string, Attributes> = {};
          subject.actions.forEach((action) => {
            actions[action.actionKey] = {
              ...action.numericAttributes,
              ...action.categoricalAttributes,
            };
          });

          const subjectAttributes = {
            ...subject.subjectAttributes.numeric_attributes,
            ...subject.subjectAttributes.categorical_attributes,
          };

          const banditAssignment = client.getBanditAction(
            flagKey,
            subject.subjectKey,
            subjectAttributes,
            actions,
            defaultValue,
          );

          // Do this check in addition to assertions to provide helpful information on exactly which
          // evaluation failed to produce an expected result
          if (
            banditAssignment.variation !== subject.assignment.variation ||
            banditAssignment.action !== subject.assignment.action
          ) {
            console.error(
              `Unexpected result for flag ${flagKey} and subject ${subject.subjectKey}`,
            );
          }

          expect(banditAssignment.variation).toBe(subject.assignment.variation);
          expect(banditAssignment.action).toBe(subject.assignment.action);
          numAssignmentsChecked += 1;
        });
        // Ensure that this test case correctly checked some test assignments
        expect(numAssignmentsChecked).toBeGreaterThan(0);
      },
    );
  });

  //TODO: test that verifies that the bandit logger called with expected values
});
