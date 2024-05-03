/**
 * ConfigurationStore interface
 *
 * The interface guides implementation
 * of a policy for handling a mixture of async and sync storage.
 *
 * The goal is to support remote API responses to be written to the sync and async store,
 * while also supporting reading from the sync store to maintain public SDK APIs.
 *
 * Implementation is handled in upstream libraries to best support their use case, some ideas:
 *
 * - Javascript frontend:
 *   - SyncStore: backed by localStorage
 *   - AsyncStore: backed by IndexedDB or chrome.storage.local
 *
 * - NodeJS backend:
 *   - SyncStore: backed by LRU cache
 *   - AsyncStore: none
 *
 * The policy choices surrounding the use of one or more underlying storages are
 * implementation specific and handled upstream.
 */
export interface IConfigurationStore<T> {
  servingStore: ISyncStore<T>;
  persistentStore: IAsyncStore<T> | null;

  init(): Promise<void>;
  get(key: string): T;
  getKeys(): string[];
  isInitialized(): boolean;
  setEntries(entries: Record<string, T>): Promise<void>;
}

export interface ISyncStore<T> {
  get(key: string): T;
  getKeys(): string[];
  isInitialized(): boolean;
  setEntries(entries: Record<string, T>): void;
}

export interface IAsyncStore<T> {
  isInitialized(): boolean;
  getEntries(): Promise<Record<string, T>>;
  setEntries(entries: Record<string, T>): Promise<void>;
}
