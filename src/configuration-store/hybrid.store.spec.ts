import { IAsyncStore, ISyncStore } from './configuration-store';
import { HybridConfigurationStore } from './hybrid.store';

describe('HybridConfigurationStore', () => {
  let syncStoreMock: ISyncStore<string>;
  let asyncStoreMock: IAsyncStore<string>;
  let store: HybridConfigurationStore<string>;

  beforeEach(() => {
    syncStoreMock = {
      get: jest.fn(),
      entries: jest.fn(),
      getKeys: jest.fn(),
      isInitialized: jest.fn(),
      setEntries: jest.fn(),
    };

    asyncStoreMock = {
      entries: jest.fn(),
      isInitialized: jest.fn(),
      isExpired: jest.fn(),
      setEntries: jest.fn(),
    };

    store = new HybridConfigurationStore(syncStoreMock, asyncStoreMock);
  });

  describe('init', () => {
    it('should initialize the serving store with entries from the persistent store if the persistent store is initialized', async () => {
      const entries = { key1: 'value1', key2: 'value2' };
      (asyncStoreMock.isInitialized as jest.Mock).mockReturnValue(true);
      (asyncStoreMock.entries as jest.Mock).mockResolvedValue(entries);

      await store.init();

      expect(syncStoreMock.setEntries).toHaveBeenCalledWith(entries);
    });
  });

  describe('isExpired', () => {
    it("is the persistent store's expired value", async () => {
      (asyncStoreMock.isExpired as jest.Mock).mockResolvedValue(true);
      expect(await store.isExpired()).toBe(true);

      (asyncStoreMock.isExpired as jest.Mock).mockResolvedValue(false);
      expect(await store.isExpired()).toBe(false);
    });

    it('is true without a persistent store', async () => {
      const mixedStoreWithNull = new HybridConfigurationStore(syncStoreMock, null);
      expect(await mixedStoreWithNull.isExpired()).toBe(true);
    });
  });

  describe('isInitialized', () => {
    it('should return true if both stores are initialized', () => {
      (syncStoreMock.isInitialized as jest.Mock).mockReturnValue(true);
      (asyncStoreMock.isInitialized as jest.Mock).mockReturnValue(true);

      expect(store.isInitialized()).toBe(true);
    });

    it('should return false if either store is not initialized', () => {
      (syncStoreMock.isInitialized as jest.Mock).mockReturnValue(false);
      (asyncStoreMock.isInitialized as jest.Mock).mockReturnValue(true);

      expect(store.isInitialized()).toBe(false);
    });
  });

  describe('entries', () => {
    it('should return all entries from the serving store', () => {
      const entries = { key1: 'value1', key2: 'value2' };
      (syncStoreMock.entries as jest.Mock).mockReturnValue(entries);
      expect(store.entries()).toEqual(entries);
    });
  });

  describe('setEntries', () => {
    it('should set entries in both stores if the persistent store is present', async () => {
      const entries = { key1: 'value1', key2: 'value2' };
      await store.setEntries(entries);

      expect(asyncStoreMock.setEntries).toHaveBeenCalledWith(entries);
      expect(syncStoreMock.setEntries).toHaveBeenCalledWith(entries);
    });

    it('should only set entries in the serving store if the persistent store is null', async () => {
      const mixedStoreWithNull = new HybridConfigurationStore(syncStoreMock, null);
      const entries = { key1: 'value1', key2: 'value2' };
      await mixedStoreWithNull.setEntries(entries);

      expect(syncStoreMock.setEntries).toHaveBeenCalledWith(entries);
    });
  });
});
