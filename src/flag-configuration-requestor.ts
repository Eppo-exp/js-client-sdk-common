import { IConfigurationStore } from './configuration-store/configuration-store';
import { IHttpClient } from './http-client';
import { Flag } from './interfaces';

const UFC_ENDPOINT = '/flag-config/v1/config';

interface IUniversalFlagConfig {
  flags: Record<string, Flag>;
}

export default class FlagConfigurationRequestor {
  constructor(
    private configurationStore: IConfigurationStore<Flag>,
    private httpClient: IHttpClient,
  ) {}

  async fetchAndStoreConfigurations(): Promise<Record<string, Flag>> {
    const responseData = await this.httpClient.get<IUniversalFlagConfig>(UFC_ENDPOINT);
    if (!responseData) {
      return {};
    }
    await this.configurationStore.setEntries(responseData.flags);
    return responseData.flags;
  }
}
