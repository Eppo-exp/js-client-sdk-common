import { IConfigurationStore } from './configuration-store/configuration-store';
import { IHttpClient } from './http-client';
import { BanditVariation, BanditParameters, Flag } from './interfaces';

// Requests AND stores flag configurations
export default class ConfigurationRequestor {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly flagConfigurationStore: IConfigurationStore<Flag>,
    private readonly banditVariationConfigurationStore: IConfigurationStore<
      BanditVariation[]
    > | null,
    private readonly banditModelConfigurationStore: IConfigurationStore<BanditParameters> | null,
  ) {}

  async fetchAndStoreConfigurations(): Promise<void> {
    const configResponse = await this.httpClient.getUniversalFlagConfiguration();
    if (!configResponse?.flags) {
      return;
    }

    await this.flagConfigurationStore.setEntries(configResponse.flags);
    const flagsHaveBandits = Object.keys(configResponse.bandits ?? {}).length > 0;
    const banditStoresProvided = Boolean(
      this.banditVariationConfigurationStore && this.banditModelConfigurationStore,
    );
    if (flagsHaveBandits && banditStoresProvided) {
      // Map bandit flag associations by flag key for quick lookup (instead of bandit key as provided by the UFC)
      const banditVariations = this.indexBanditVariationsByFlagKey(configResponse.bandits);
      this.banditVariationConfigurationStore?.setEntries(banditVariations);
      // TODO: different polling intervals for bandit parameters
      const banditResponse = await this.httpClient.getBanditParameters();
      if (banditResponse?.bandits) {
        if (!this.banditModelConfigurationStore) {
          throw new Error('Bandit parameters fetched but no bandit configuration store provided');
        }
        await this.banditModelConfigurationStore.setEntries(banditResponse.bandits);
      }
    }
  }

  private indexBanditVariationsByFlagKey(
    banditVariationsByBanditKey: Record<string, BanditVariation[]>,
  ): Record<string, BanditVariation[]> {
    const banditVariationsByFlagKey: Record<string, BanditVariation[]> = {};
    Object.values(banditVariationsByBanditKey).forEach((banditVariations) => {
      banditVariations.forEach((banditVariation) => {
        let banditVariations = banditVariationsByFlagKey[banditVariation.flagKey];
        if (!banditVariations) {
          banditVariations = [];
          banditVariationsByFlagKey[banditVariation.flagKey] = banditVariations;
        }
        banditVariations.push(banditVariation);
      });
    });
    return banditVariationsByFlagKey;
  }
}
