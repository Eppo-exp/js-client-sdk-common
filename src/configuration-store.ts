export interface IConfigurationStore {
  get<T>(key: string): T;
  setEntries<T>(entries: Record<string, T>): void;
  isExpired(): boolean;
}
