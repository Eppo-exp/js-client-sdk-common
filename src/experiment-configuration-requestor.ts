import { IConfigurationStore } from './configuration-store';
import { IExperimentConfiguration } from './dto/experiment-configuration-dto';
import HttpClient from './http-client';

const RAC_ENDPOINT = '/randomized_assignment/v2/config';

interface IRandomizedAssignmentConfig {
  flags: Record<string, IExperimentConfiguration>;
}

export default class ExperimentConfigurationRequestor {
  constructor(private configurationStore: IConfigurationStore, private httpClient: HttpClient) {}

  async fetchAndStoreConfigurations(): Promise<Record<string, IExperimentConfiguration>> {
    const responseData = await this.httpClient.get<IRandomizedAssignmentConfig>(RAC_ENDPOINT);
    await this.configurationStore.setEntries<IExperimentConfiguration>(responseData.flags);
    return responseData.flags;
  }
}
