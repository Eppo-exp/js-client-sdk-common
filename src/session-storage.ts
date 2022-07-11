export class EppoSessionStorage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public get(key: string): any {
    if (this.hasWindowSessionStorage()) {
      return window.sessionStorage.getItem(key);
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

  public set(key: string, value: string) {
    this.hasWindowSessionStorage() && window.sessionStorage.setItem(key, value);
  }
}
