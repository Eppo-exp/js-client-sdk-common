import { getMD5Hash } from '../obfuscation';

import { LRUCache } from './lru-cache';

export type AssignmentCacheKey = {
  subjectKey: string;
  flagKey: string;
  allocationKey: string;
  variationKey: string;
};

/** Converts an {@link AssignmentCacheKey} to a string. */
export function assignmentCacheKeyToString({
  subjectKey,
  flagKey,
  allocationKey,
}: AssignmentCacheKey): string {
  return getMD5Hash([subjectKey, flagKey, allocationKey].join(';'));
}

export interface AsyncMap<K, V> {
  get(key: K): Promise<V | undefined>;

  set(key: K, value: V): Promise<void>;

  has(key: K): Promise<boolean>;
}

export interface AssignmentCache {
  set(key: AssignmentCacheKey): void;

  has(key: AssignmentCacheKey): boolean;
}

export abstract class AbstractAssignmentCache<T extends Map<string, string>>
  implements AssignmentCache
{
  // key -> variation value hash
  protected constructor(protected readonly delegate: T) {}

  /** Returns whether the provided {@link AssignmentCacheKey} is present in the cache. */
  has(key: AssignmentCacheKey): boolean {
    const isPresent = this.delegate.has(assignmentCacheKeyToString(key));
    if (!isPresent) {
      // no cache key present
      return false;
    }

    // the subject has been assigned to a different variation
    // than was previously logged.
    // in this case we need to log the assignment again.
    const cachedValue = this.get(key);
    return cachedValue === getMD5Hash(key.variationKey);
  }

  private get(key: AssignmentCacheKey): string | undefined {
    return this.delegate.get(assignmentCacheKeyToString(key));
  }

  /**
   * Stores the provided {@link AssignmentCacheKey} in the cache. If the key already exists, it
   * will be overwritten.
   */
  set(key: AssignmentCacheKey): void {
    this.delegate.set(assignmentCacheKeyToString(key), getMD5Hash(key.variationKey));
  }

  /**
   * Returns an array with all {@link AssignmentCacheKey} entries in the cache as an array of
   * {@link string}s.
   */
  entries(): IterableIterator<[string, string]> {
    return this.delegate.entries();
  }
}

/**
 * A cache that never expires.
 *
 * The primary use case is for client-side SDKs, where the cache is only used
 * for a single user.
 */
export class NonExpiringInMemoryAssignmentCache extends AbstractAssignmentCache<
  Map<string, string>
> {
  constructor(store = new Map<string, string>()) {
    super(store);
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
