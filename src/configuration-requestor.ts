import { IConfigurationStore } from './configuration-store/configuration-store';
import { IHttpClient } from './http-client';
import { BanditFlagAssociation, BanditParameters, Flag } from './interfaces';

// Requests AND stores flag configurations
export default class ConfigurationRequestor {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly flagConfigurationStore: IConfigurationStore<Flag>,
    private readonly flagBanditConfigurationStore: IConfigurationStore<
      BanditFlagAssociation[]
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
      this.flagBanditConfigurationStore && this.banditModelConfigurationStore,
    );
    if (flagsHaveBandits && banditStoresProvided) {
      // Map bandit flag associations by flag key for quick lookup (instead of bandit key as provided by the UFC)
      const banditFlagAssociations = this.indexBanditFlagAssociationsByFlagKey(
        configResponse.bandits,
      );
      this.flagBanditConfigurationStore?.setEntries(banditFlagAssociations);
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

  private indexBanditFlagAssociationsByFlagKey(
    banditFlagAssociationsByBanditKey: Record<string, BanditFlagAssociation[]>,
  ): Record<string, BanditFlagAssociation[]> {
    const banditFlagAssociationsByFlagKey: Record<string, BanditFlagAssociation[]> = {};
    Object.values(banditFlagAssociationsByBanditKey).forEach((banditFlags) => {
      banditFlags.forEach((banditFlag) => {
        let flagAssociations = banditFlagAssociationsByFlagKey[banditFlag.flagKey];
        if (!flagAssociations) {
          flagAssociations = [];
          banditFlagAssociationsByFlagKey[banditFlag.flagKey] = flagAssociations;
        }
        flagAssociations.push(banditFlag);
      });
    });
    return banditFlagAssociationsByFlagKey;
  }
}
