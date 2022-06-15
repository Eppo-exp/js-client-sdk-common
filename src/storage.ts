const SESSION_STORAGE_INITIALIZED = 'eppo-session-storage-initialized';

export class EppoSessionStorage {
  // Fallback storage in case the user has disabled session storage in the browser.
  private fallbackStorage: Record<string, string> = {};

  public get<T>(key: string): T {
    let serializedEntry;
    if (this.hasWindowSessionStorage()) {
      serializedEntry = window.sessionStorage.getItem(key);
    } else {
      serializedEntry = this.fallbackStorage[key];
    }
    if (serializedEntry) {
      return JSON.parse(serializedEntry);
    }
    return null;
  }

  private hasWindowSessionStorage(): boolean {
    try {
      return typeof window !== 'undefined' && !!window.sessionStorage;
    } catch {
      // Some browsers throw an error if session storage is disabled and you try to access it
      return false;
    }
  }

  public isSessionStorageInitialized(): boolean {
    return !!this.get(SESSION_STORAGE_INITIALIZED);
  }

  public setEntries<T>(entries: Record<string, T>) {
    if (this.hasWindowSessionStorage()) {
      this.setEntriesInSessionStorage(entries);
    } else {
      this.setEntriesInFallbackStorage(entries);
    }
  }

  private setEntriesInSessionStorage<T>(entries: Record<string, T>) {
    Object.entries(entries).forEach(([key, val]) => {
      window.sessionStorage.setItem(key, JSON.stringify(val));
    });
    window.sessionStorage.setItem(SESSION_STORAGE_INITIALIZED, 'true');
  }

  private setEntriesInFallbackStorage<T>(entries: Record<string, T>) {
    Object.entries(entries).forEach(([key, val]) => {
      this.fallbackStorage[key] = JSON.stringify(val);
    });
  }
}
