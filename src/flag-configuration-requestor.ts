import { IConfigurationStore } from './configuration-store';
import HttpClient from './http-client';
import { Flag } from './interfaces';

const UFC_ENDPOINT = '/flag_config/v1/config';

interface IUniversalFlagConfig {
  flags: Record<string, Flag>;
}

export default class FlagConfigurationRequestor {
  constructor(private configurationStore: IConfigurationStore, private httpClient: HttpClient) {}

  async fetchAndStoreConfigurations(): Promise<Record<string, Flag>> {
    const responseData = await this.httpClient.get<IUniversalFlagConfig>(UFC_ENDPOINT);
    if (!responseData) {
      return {};
    }
    this.configurationStore.setEntries<Flag>(responseData.flags);
    return responseData.flags;
  }
}
