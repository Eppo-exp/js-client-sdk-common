import { IAsyncStore, ISyncStore } from './configuration-store';
import { HybridConfigurationStore } from './hybrid.store';

describe('HybridConfigurationStore', () => {
  let syncStoreMock: ISyncStore<string>;
  let asyncStoreMock: IAsyncStore<string>;
  let store: HybridConfigurationStore<string>;

  beforeEach(() => {
    syncStoreMock = {
      get: jest.fn(),
      getKeys: jest.fn(),
      isInitialized: jest.fn(),
      setEntries: jest.fn(),
    };

    asyncStoreMock = {
      getEntries: jest.fn(),
      isInitialized: jest.fn(),
      setEntries: jest.fn(),
    };

    store = new HybridConfigurationStore(syncStoreMock, asyncStoreMock);
  });

  describe('init', () => {
    it('should initialize the serving store with entries from the persistent store if the persistent store is initialized', async () => {
      const entries = { key1: 'value1', key2: 'value2' };
      (asyncStoreMock.isInitialized as jest.Mock).mockReturnValue(true);
      (asyncStoreMock.getEntries as jest.Mock).mockResolvedValue(entries);

      await store.init();

      expect(syncStoreMock.setEntries).toHaveBeenCalledWith(entries);
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
