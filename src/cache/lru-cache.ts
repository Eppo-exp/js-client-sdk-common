/**
 * LRUCache is a cache that stores a maximum number of items.
 *
 * Items are removed from the cache when the cache is full.
 *
 * The cache is implemented as a Set, which maintains insertion order:
 * ```
 * You can iterate through the elements of a set in insertion order. The insertion order corresponds
 * to the order in which each element was inserted into the set by the add()
 * ```
 * Source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set
 */
export class LRUCache implements Set<string> {
  private readonly cache = new Set<string>();

  constructor(private readonly capacity: number) {}

  forEach(
    callbackfn: (value: string, value2: string, set: Set<string>) => void,
    // eslint-disable-next-line
    thisArg?: any,
  ): void {
    this.cache.forEach(callbackfn, thisArg);
  }

  [Symbol.iterator](): IterableIterator<string> {
    return this.cache[Symbol.iterator]();
  }

  [Symbol.toStringTag]: string;

  readonly size: number = this.cache.size;

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
    const { cache } = this;
    if (!cache.has(key)) {
      return false;
    }

    // the delete and set operations are used together to ensure that the most recently accessed
    // or added item is always considered the "newest" in terms of access order.
    // This is crucial for maintaining the correct order of elements in the cache,
    // which directly impacts which item is considered the least recently used (LRU) and
    // thus eligible for eviction when the cache reaches its capacity.
    this.delete(key);
    cache.add(key);

    return true;
  }

  add(key: string): this {
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

    this.cache.add(key);
    return this;
  }
}
