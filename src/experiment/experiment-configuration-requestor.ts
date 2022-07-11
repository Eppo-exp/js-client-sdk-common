import HttpClient from '../http-client';
import { EppoLocalStorage } from '../local-storage';

import { IExperimentConfiguration } from './experiment-configuration';

const RAC_ENDPOINT = '/randomized_assignment/config';

interface IRandomizedAssignmentConfig {
  experiments: Record<string, IExperimentConfiguration>;
}

export default class ExperimentConfigurationRequestor {
  constructor(private configurationStore: EppoLocalStorage, private httpClient: HttpClient) {}

  async fetchAndStoreConfigurations(): Promise<Record<string, IExperimentConfiguration>> {
    const responseData = await this.httpClient.get<IRandomizedAssignmentConfig>(RAC_ENDPOINT);
    this.configurationStore.setEntries<IExperimentConfiguration>(responseData.experiments);
    return responseData.experiments;
  }
}
