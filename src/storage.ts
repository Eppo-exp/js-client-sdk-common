const SESSION_STORAGE_INITIALIZED = 'eppo-session-storage-initialized';

export class EppoSessionStorage {
  public get<T>(key: string): T {
    if (this.hasWindowSessionStorage()) {
      const serializedEntry = window.sessionStorage.getItem(key);
      if (serializedEntry) {
        return JSON.parse(serializedEntry);
      }
    }
    return null;
  }

  // Checks whether session storage is enabled in the browser (the user might have disabled it).
  private hasWindowSessionStorage(): boolean {
    try {
      return typeof window !== 'undefined' && !!window.sessionStorage;
    } catch {
      // Chrome throws an error if session storage is disabled and you try to access it
      return false;
    }
  }

  public isInitialized(): boolean {
    return !!this.get(SESSION_STORAGE_INITIALIZED);
  }

  public setEntries<T>(entries: Record<string, T>) {
    if (this.hasWindowSessionStorage()) {
      Object.entries(entries).forEach(([key, val]) => {
        window.sessionStorage.setItem(key, JSON.stringify(val));
      });
      window.sessionStorage.setItem(SESSION_STORAGE_INITIALIZED, 'true');
    }
  }
}
