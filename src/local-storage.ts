export class EppoLocalStorage {
  public get<T>(key: string): T {
    if (this.hasWindowLocalStorage()) {
      const serializedEntry = window.localStorage.getItem(key);
      if (serializedEntry) {
        return JSON.parse(serializedEntry);
      }
    }
    return null;
  }

  // Checks whether local storage is enabled in the browser (the user might have disabled it).
  private hasWindowLocalStorage(): boolean {
    try {
      return typeof window !== 'undefined' && !!window.localStorage;
    } catch {
      // Chrome throws an error if local storage is disabled and you try to access it
      return false;
    }
  }

  public setEntries<T>(entries: Record<string, T>) {
    if (this.hasWindowLocalStorage()) {
      Object.entries(entries).forEach(([key, val]) => {
        window.localStorage.setItem(key, JSON.stringify(val));
      });
    }
  }
}
