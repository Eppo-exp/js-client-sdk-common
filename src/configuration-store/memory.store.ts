import { IConfigurationStore, ISyncStore } from './configuration-store';

export class MemoryStore<T> implements ISyncStore<T> {
  private store: Record<string, T> = {};
  private initialized = false;

  get(key: string): T | null {
    return this.store[key] ?? null;
  }

  getAll(): Record<string, T> {
    return this.store;
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

  init(): Promise<void> {
    this.initialized = true;
    return Promise.resolve();
  }

  get(key: string): T | null {
    return this.servingStore.get(key);
  }

  getAll(): Record<string, T> {
    return this.servingStore.getAll();
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
