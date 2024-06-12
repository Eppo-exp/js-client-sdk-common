/**
 * LRUCache is a cache that stores a maximum number of items.
 *
 * Items are removed from the cache when the cache is full.
 *
 * The cache is implemented as a Map, which is a built-in JavaScript object.
 * The Map object holds key-value pairs and remembers the order of key-value pairs as they were inserted.
 */
export class LRUCache implements Map<string, string> {
  private readonly cache = new Map<string, string>();
  [Symbol.toStringTag]: string;

  constructor(private readonly capacity: number) {}

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.cache[Symbol.iterator]();
  }

  forEach(
    callbackFn: (value: string, key: string, map: Map<string, string>) => void,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    thisArg?: any,
  ): void {
    this.cache.forEach(callbackFn, thisArg);
  }

  size: number;

  entries(): IterableIterator<[string, string]> {
    return this.cache.entries();
  }

  clear() {
    this.cache.clear();
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  values(): IterableIterator<string> {
    return this.cache.values();
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  get(key: string): string | undefined {
    if (!this.has(key)) {
      return undefined;
    }

    const value = this.cache.get(key);

    if (value !== undefined) {
      // the delete and set operations are used together to ensure that the most recently accessed
      // or added item is always considered the "newest" in terms of access order.
      // This is crucial for maintaining the correct order of elements in the cache,
      // which directly impacts which item is considered the least recently used (LRU) and
      // thus eligible for eviction when the cache reaches its capacity.
      this.delete(key);
      this.cache.set(key, value);
    }

    return value;
  }

  set(key: string, value: string): this {
    if (this.capacity === 0) {
      return this;
    }

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // To evict the least recently used (LRU) item, we retrieve the first key in the Map.
      // This is possible because the Map object in JavaScript maintains the insertion order of the keys.
      // Therefore, the first key represents the oldest entry, which is the least recently used item in our cache.
      // We use Map.prototype.keys().next().value to obtain this oldest key and then delete it from the cache.
      const oldestKey = this.cache.keys().next().value;
      this.delete(oldestKey);
    }

    this.cache.set(key, value);
    return this;
  }
}
