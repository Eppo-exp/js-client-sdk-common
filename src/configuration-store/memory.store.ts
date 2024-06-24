import { IConfigurationStore, ISyncStore } from './configuration-store';

export class MemoryStore<T> implements ISyncStore<T> {
  private store: Record<string, T> = {};
  private initialized = false;
  private configFetchedAt: string;
  private configPublishedAt: string;

  get(key: string): T | null {
    return this.store[key] ?? null;
  }

  getKeys(): string[] {
    return Object.keys(this.store);
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  setEntries(entries: Record<string, T>): void {
    this.store = { ...entries };
    this.initialized = true;
  }
}

export class MemoryOnlyConfigurationStore<T> implements IConfigurationStore<T> {
  private readonly servingStore: ISyncStore<T> = new MemoryStore<T>();
  private initialized = false;
  private configFetchedAt: string;
  private configPublishedAt: string;

  init(): Promise<void> {
    this.initialized = true;
    return Promise.resolve();
  }

  get(key: string): T | null {
    return this.servingStore.get(key);
  }

  getKeys(): string[] {
    return this.servingStore.getKeys();
  }

  async isExpired(): Promise<boolean> {
    return true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async setEntries(entries: Record<string, T>): Promise<boolean> {
    this.servingStore.setEntries(entries);
    this.initialized = true;
    return true;
  }

  public getConfigFetchedAt(): string {
    return this.configFetchedAt;
  }

  public setConfigFetchedAt(configFetchedAt: string): void {
    this.configFetchedAt = configFetchedAt;
  }

  public getConfigPublishedAt(): string {
    return this.configPublishedAt;
  }

  public setConfigPublishedAt(configPublishedAt: string): void {
    this.configPublishedAt = configPublishedAt;
  }
}
