import { logger, loggerPrefix } from '../application-logger';

import { IAsyncStore, IConfigurationStore, ISyncStore } from './configuration-store';

export class HybridConfigurationStore<T> implements IConfigurationStore<T> {
  constructor(
    protected readonly servingStore: ISyncStore<T>,
    protected readonly persistentStore: IAsyncStore<T> | null,
  ) {}

  private configFetchTime: string;
  private configPublishTime: string;

  /**
   * Initialize the configuration store by loading the entries from the persistent store into the serving store.
   */
  async init(): Promise<void> {
    if (!this.persistentStore) {
      return;
    }

    if (!this.persistentStore.isInitialized()) {
      /**
       * The initial remote request to the remote API failed
       * or never happened because we are in the cool down period.
       *
       * Shows a log message that the assignments served from the serving store
       * may be stale.
       */
      logger.warn(
        `${loggerPrefix} Persistent store is not initialized from remote configuration. Serving assignments that may be stale.`,
      );
    }

    const entries = await this.persistentStore.getEntries();
    this.servingStore.setEntries(entries);
  }

  public isInitialized(): boolean {
    return this.servingStore.isInitialized() && (this.persistentStore?.isInitialized() ?? true);
  }

  public async isExpired(): Promise<boolean> {
    const isExpired = await this.persistentStore?.isExpired();
    return isExpired ?? true;
  }

  public get(key: string): T | null {
    if (!this.servingStore.isInitialized()) {
      logger.warn(`${loggerPrefix} getting a value from a ServingStore that is not initialized.`);
    }
    return this.servingStore.get(key);
  }

  public getKeys(): string[] {
    return this.servingStore.getKeys();
  }

  public async setEntries(entries: Record<string, T>): Promise<boolean> {
    if (this.persistentStore) {
      // Persistence store is now initialized and should mark itself accordingly.
      await this.persistentStore.setEntries(entries);
    }
    this.servingStore.setEntries(entries);
    return true;
  }

  public getConfigFetchTime(): string {
    return this.configFetchTime;
  }

  public setConfigFetchTime(configFetchTime: string): void {
    this.configFetchTime = configFetchTime;
  }

  public getConfigPublishTime(): string {
    return this.configPublishTime;
  }

  public setConfigPublishTime(configPublishTime: string): void {
    this.configPublishTime = configPublishTime;
  }
}
