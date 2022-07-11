/**
 * @jest-environment jsdom
 */

import { EppoSessionStorage } from './session-storage';

describe('EppoSessionStorage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  const storage = new EppoSessionStorage();
  describe('get and set', () => {
    it('returns null if entry is not present', () => {
      expect(storage.get('does not exist')).toEqual(null);
    });

    it('returns null if local storage is not enabled', () => {
      const {
        window: { sessionStorage },
      } = global;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      delete global.window.sessionStorage;
      storage.set('key1', 'foo');
      expect(storage.get('key1')).toEqual(null);
      global.window.sessionStorage = sessionStorage;
    });

    it('returns stored entries', () => {
      storage.set('key1', 'foo');
      expect(storage.get('key1')).toEqual('foo');
    });
  });
});
