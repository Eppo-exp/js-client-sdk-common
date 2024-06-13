import {
  readMockUFCResponse,
  MOCK_BANDIT_MODELS_RESPONSE_FILE,
  MOCK_FLAGS_WITH_BANDITS_RESPONSE_FILE,
} from '../../test/testHelpers';
import ApiEndpoints from '../api-endpoints';
import ConfigurationRequestor from '../configuration-requestor';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import FetchHttpClient from '../http-client';
import { BanditParameters, Flag } from '../interfaces';

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

    client = new EppoClient(flagStore, banditStore);
    client.setIsGracefulFailureMode(false);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('TODO', () => {
    // TODO: bandit test cases with the client
  });
});
