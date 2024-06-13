import { IConfigurationStore } from './configuration-store/configuration-store';
import { IHttpClient } from './http-client';
import { BanditParameters, Flag } from './interfaces';

// Requests AND stores flag configurations
export default class ConfigurationRequestor {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly flagConfigurationStore: IConfigurationStore<Flag>,
    private readonly banditConfigurationStore: IConfigurationStore<BanditParameters> | null,
  ) {}

  async fetchAndStoreConfigurations(): Promise<void> {
    const configResponse = await this.httpClient.getUniversalFlagConfiguration();
    if (!configResponse?.flags) {
      return;
    }

    await this.flagConfigurationStore.setEntries(configResponse.flags);
    if (Object.keys(configResponse.bandits ?? {}).length) {
      // TODO: different polling intervals for bandit parameters
      const banditResponse = await this.httpClient.getBanditParameters();
      if (banditResponse?.bandits) {
        if (!this.banditConfigurationStore) {
          throw new Error('Bandit parameters fetched but no bandit configuration store provided');
        }
        await this.banditConfigurationStore.setEntries(banditResponse.bandits);
      }
    }
  }
}
