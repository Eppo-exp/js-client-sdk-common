export interface IConfigurationStore {
  get<T>(key: string): Promise<T>;
  setEntries<T>(entries: Record<string, T>): Promise<void>;
}
