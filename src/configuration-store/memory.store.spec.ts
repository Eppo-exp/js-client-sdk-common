import { MemoryOnlyConfigurationStore } from './memory.store';

describe('MemoryOnlyConfigurationStore', () => {
  let memoryStore: MemoryOnlyConfigurationStore<string>;

  beforeEach(() => {
    memoryStore = new MemoryOnlyConfigurationStore();
  });

  it('should initialize without any entries', () => {
    expect(memoryStore.isInitialized()).toBe(false);
    expect(memoryStore.getKeys()).toEqual([]);
  });

  it('should return null for non-existent keys', () => {
    expect(memoryStore.get('nonexistent')).toBeNull();
  });

  it('should allow setting and retrieving entries', async () => {
    await memoryStore.setEntries({ key1: 'value1', key2: 'value2' });
    expect(memoryStore.get('key1')).toBe('value1');
    expect(memoryStore.get('key2')).toBe('value2');
  });

  it('should report initialized after setting entries', async () => {
    await memoryStore.setEntries({ key1: 'value1' });
    expect(memoryStore.isInitialized()).toBe(true);
  });

  it('should return all keys', async () => {
    await memoryStore.setEntries({ key1: 'value1', key2: 'value2', key3: 'value3' });
    expect(memoryStore.getKeys()).toEqual(['key1', 'key2', 'key3']);
  });

  it('should overwrite existing entries', async () => {
    await memoryStore.setEntries({ key1: 'value1' });
    await memoryStore.setEntries({ key1: 'newValue1' });
    expect(memoryStore.get('key1')).toBe('newValue1');
  });
});
