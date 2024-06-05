import { IConfigurationStore } from './configuration-store/configuration-store';
import { IHttpClient } from './http-client';
import { Flag } from './interfaces';

// Requests AND stores flag configurations
export default class FlagConfigurationRequestor {
  constructor(
    private readonly configurationStore: IConfigurationStore<Flag>,
    private readonly httpClient: IHttpClient,
  ) {}

  async fetchAndStoreConfigurations(): Promise<Record<string, Flag>> {
    const responseData = await this.httpClient.getUniversalFlagConfiguration();
    if (!responseData) {
      return {};
    }
    await this.configurationStore.setEntries(responseData.flags);
    return responseData.flags;
  }
}
