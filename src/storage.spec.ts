/**
 * @jest-environment jsdom
 */

import { EppoSessionStorage } from './storage';

describe('EppoSessionStorage', () => {
  interface ITestEntry {
    items: string[];
  }
  const config1 = {
    items: ['test', 'control', 'blue'],
  };
  const config2 = {
    items: ['red'],
  };

  const storage = new EppoSessionStorage();

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  describe('get', () => {
    it('returns null if entry is not present', () => {
      expect(storage.get('does not exist')).toEqual(null);
    });

    it('returns stored entries', () => {
      expect(storage.isInitialized()).toEqual(false);
      storage.setEntries({ key1: config1, key2: config2 });
      expect(storage.isInitialized()).toEqual(true);
      expect(storage.get<ITestEntry>('key1')).toEqual(config1);
      expect(storage.get<ITestEntry>('key2')).toEqual(config2);
    });
  });
});
