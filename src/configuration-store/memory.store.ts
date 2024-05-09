import { IAsyncStore, IConfigurationStore, ISyncStore } from './configuration-store';

export class MemoryStore<T> implements ISyncStore<T> {
  private store: Record<string, T> = {};
  private initialized = false;

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
    Object.entries(entries).forEach(([key, val]) => {
      this.store[key] = val;
    });
    this.initialized = true;
  }
}

export class MemoryOnlyConfigurationStore<T> implements IConfigurationStore<T> {
  servingStore: ISyncStore<T>;
  persistentStore: IAsyncStore<T> | null;
  private initialized: boolean;

  constructor() {
    this.servingStore = new MemoryStore<T>();
    this.persistentStore = null;
    this.initialized = false;
  }

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

  async setEntries(entries: Record<string, T>): Promise<void> {
    this.servingStore.setEntries(entries);
    this.initialized = true;
  }
}
