import { logger } from '../application-logger';

import { IAsyncStore, IConfigurationStore, ISyncStore } from './configuration-store';

export class HybridConfigurationStore<T> implements IConfigurationStore<T> {
  servingStore: ISyncStore<T>;
  persistentStore: IAsyncStore<T> | null;

  constructor(servingStore: ISyncStore<T>, persistentStore: IAsyncStore<T> | null) {
    this.servingStore = servingStore;
    this.persistentStore = persistentStore;
  }

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
        'Persistent store is not initialized from remote configuration. Serving assignments that may be stale.',
      );
    }

    const entries = await this.persistentStore.getEntries();
    this.servingStore.setEntries(entries);
  }

  public isInitialized(): boolean {
    return this.servingStore.isInitialized() && (this.persistentStore?.isInitialized() ?? true);
  }

  public get(key: string): T {
    if (!this.servingStore.isInitialized()) {
      logger.warn('getting a value from a ServingStore that is not initialized.');
    }
    return this.servingStore.get(key);
  }

  public getKeys(): string[] {
    return this.servingStore.getKeys();
  }

  public async setEntries(entries: Record<string, any>): Promise<void> {
    if (this.persistentStore) {
      // Persistence store is now initialized and should mark itself accordingly.
      await this.persistentStore.setEntries(entries);
    }
    this.servingStore.setEntries(entries);
  }
}
