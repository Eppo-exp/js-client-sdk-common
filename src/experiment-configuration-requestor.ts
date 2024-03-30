import { IConfigurationStore } from './configuration-store';
import { IExperimentConfiguration } from './dto/experiment-configuration-dto';
import HttpClient from './http-client';

export const RAC_ENDPOINT = '/randomized_assignment/v3/config';

export interface IRandomizedAssignmentConfig {
  flags: Record<string, IExperimentConfiguration>;
}

export default class ExperimentConfigurationRequestor {
  constructor(private configurationStore: IConfigurationStore, private httpClient: HttpClient) {}

  async fetchAndStoreConfigurations(): Promise<Record<string, IExperimentConfiguration>> {
    const responseData = await this.httpClient.get<IRandomizedAssignmentConfig>(RAC_ENDPOINT);
    if (!responseData) {
      return {};
    }
    this.configurationStore.setEntries<IExperimentConfiguration>(responseData.flags);
    return responseData.flags;
  }
}
