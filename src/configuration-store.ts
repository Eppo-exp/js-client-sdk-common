export interface IConfigurationStore {
  get<T>(key: string): T;
  getKeys(): string[];
  setEntries<T>(entries: Record<string, T>): void;
  isInitialized(): boolean;
}
