/**
 * @jest-environment jsdom
 */

import { EppoLocalStorage } from './local-storage';

describe('EppoLocalStorage', () => {
  interface ITestEntry {
    items: string[];
  }
  const config1 = {
    items: ['test', 'control', 'blue'],
  };
  const config2 = {
    items: ['red'],
  };

  const storage = new EppoLocalStorage();

  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('get and set', () => {
    it('returns null if entry is not present', () => {
      expect(storage.get('does not exist')).toEqual(null);
    });

    it('returns null if local storage is not enabled', () => {
      const {
        window: { localStorage },
      } = global;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      delete global.window.localStorage;
      storage.setEntries({ key1: config1 });
      expect(storage.get<ITestEntry>('key1')).toEqual(null);
      global.window.localStorage = localStorage;
    });

    it('returns stored entries', () => {
      storage.setEntries({ key1: config1, key2: config2 });
      expect(storage.get<ITestEntry>('key1')).toEqual(config1);
      expect(storage.get<ITestEntry>('key2')).toEqual(config2);
    });
  });
});
