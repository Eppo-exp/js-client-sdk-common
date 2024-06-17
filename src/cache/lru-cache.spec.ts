import { LRUCache } from './lru-cache';

describe('LRUCache', () => {
  let cache: LRUCache;

  beforeEach(() => {
    cache = new LRUCache(2);
  });

  it('should insert and retrieve a value', () => {
    cache.add('a');
    expect(cache.has('a')).toBeTruthy();
  });

  it('should return falsy value for missing values', () => {
    expect(cache.has('missing')).toBeFalsy();
  });

  it('should overwrite existing values', () => {
    cache.add('a');
    cache.add('a');
    expect(cache.has('a')).toBeTruthy();
  });

  it('should evict least recently used item', () => {
    cache.add('a');
    cache.add('b');
    cache.add('c');
    expect(cache.has('a')).toBeFalsy();
    expect(cache.has('b')).toBeTruthy();
    expect(cache.has('c')).toBeTruthy();
  });

  it('should move recently used item to the end of the cache', () => {
    cache.add('a');
    cache.add('b');
    cache.has('a'); // Access 'a' to make it recently used
    cache.add('c');
    expect(cache.has('a')).toBeTruthy();
    expect(cache.has('b')).toBeFalsy();
    expect(cache.has('c')).toBeTruthy();
  });

  it('should check if a key exists', () => {
    cache.add('a');
    expect(cache.has('a')).toBeTruthy();
    expect(cache.has('b')).toBeFalsy();
  });

  it('should handle the cache capacity of zero', () => {
    const zeroCache = new LRUCache(0);
    zeroCache.add('a');
    expect(zeroCache.has('a')).toBeFalsy();
  });

  it('should handle the cache capacity of one', () => {
    const oneCache = new LRUCache(1);
    oneCache.add('a');
    expect(oneCache.has('a')).toBeTruthy();
    oneCache.add('b');
    expect(oneCache.has('a')).toBeFalsy();
    expect(oneCache.has('b')).toBeTruthy();
  });
});
