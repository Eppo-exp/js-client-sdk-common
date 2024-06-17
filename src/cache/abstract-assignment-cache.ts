import { getMD5Hash } from '../obfuscation';

import { LRUCache } from './lru-cache';

export type AssignmentCacheKey = {
  subjectKey: string;
  flagKey: string;
  allocationKey: string;
  variationKey: string;
};

export interface AsyncMap<K, V> {
  get(key: K): Promise<V | undefined>;

  set(key: K, value: V): Promise<void>;

  has(key: K): Promise<boolean>;
}

export interface AssignmentCache {
  set(key: AssignmentCacheKey): void;

  has(key: AssignmentCacheKey): boolean;
}

export abstract class AbstractAssignmentCache<T extends Set<string>> implements AssignmentCache {
  // key -> variation value hash
  protected constructor(protected readonly delegate: T) {}

  /** Returns whether the provided {@link AssignmentCacheKey} is present in the cache. */
  has(key: AssignmentCacheKey): boolean {
    return this.delegate.has(this.toCacheKeyString(key));
  }

  /**
   * Stores the provided {@link AssignmentCacheKey} in the cache. If the key already exists, it
   * will be overwritten.
   */
  set(key: AssignmentCacheKey): void {
    this.delegate.add(this.toCacheKeyString(key));
  }

  /**
   * Returns an array with all **MD5-encoded* {@link AssignmentCacheKey} entries in the cache
   * as an array of {@link string}s.
   */
  keys(): string[] {
    return Array.from(this.delegate.keys());
  }

  protected toCacheKeyString({
    subjectKey,
    flagKey,
    allocationKey,
    variationKey,
  }: AssignmentCacheKey): string {
    return getMD5Hash([subjectKey, flagKey, allocationKey, variationKey].join(';'));
  }
}

/**
 * A cache that never expires.
 *
 * The primary use case is for client-side SDKs, where the cache is only used
 * for a single user.
 */
export class NonExpiringInMemoryAssignmentCache extends AbstractAssignmentCache<Set<string>> {
  constructor() {
    super(new Set<string>());
  }
}

/**
 * A cache that uses the LRU algorithm to evict the least recently used items.
 *
 * It is used to limit the size of the cache.
 *
 * The primary use case is for server-side SDKs, where the cache is shared across
 * multiple users. In this case, the cache size should be set to the maximum number
 * of users that can be active at the same time.
 */
export class LRUInMemoryAssignmentCache extends AbstractAssignmentCache<LRUCache> {
  constructor(maxSize: number) {
    super(new LRUCache(maxSize));
  }
}
