import { getMD5Hash } from '../obfuscation';

import { LRUCache } from './lru-cache';

/**
 * Assignment cache keys are only on the subject and flag level, while the entire value is used
 * for uniqueness checking. This way that if an assigned variation or bandit action changes for a
 * flag, it evicts the old one. Then, if an older assignment is later reassigned, it will be treated
 * as new.
 */
export type AssignmentCacheKey = {
  subjectKey: string;
  flagKey: string;
};

export type CacheKeyPair<T extends string, U extends string> = {
  [K in T]: string;
} & {
  [K in U]: string;
};

type VariationCacheValue = CacheKeyPair<'allocationKey', 'variationKey'>;
type BanditCacheValue = CacheKeyPair<'banditKey', 'actionKey'>;
export type AssignmentCacheValue = VariationCacheValue | BanditCacheValue;

export type AssignmentCacheEntry = AssignmentCacheKey & AssignmentCacheValue;

/** Converts an {@link AssignmentCacheKey} to a string. */
export function assignmentCacheKeyToString({ subjectKey, flagKey }: AssignmentCacheKey): string {
  return getMD5Hash([subjectKey, flagKey].join(';'));
}

/** Converts an {@link AssignmentCacheValue} to a string. */
export function assignmentCacheValueToString(cacheValue: AssignmentCacheValue): string {
  return getMD5Hash(Object.values(cacheValue).join(';'));
}

export interface AsyncMap<K, V> {
  get(key: K): Promise<V | undefined>;

  set(key: K, value: V): Promise<void>;

  has(key: K): Promise<boolean>;
}

export interface AssignmentCache {
  set(key: AssignmentCacheEntry): void;

  has(key: AssignmentCacheEntry): boolean;
}

export abstract class AbstractAssignmentCache<T extends Map<string, string>>
  implements AssignmentCache
{
  // key -> variation value hash
  protected constructor(protected readonly delegate: T) {}

  /** Returns whether the provided {@link AssignmentCacheEntry} is present in the cache. */
  has(entry: AssignmentCacheEntry): boolean {
    return this.get(entry) === assignmentCacheValueToString(entry);
  }

  private get(key: AssignmentCacheKey): string | undefined {
    return this.delegate.get(assignmentCacheKeyToString(key));
  }

  /**
   * Stores the provided {@link AssignmentCacheEntry} in the cache. If the key already exists, it
   * will be overwritten.
   */
  set(entry: AssignmentCacheEntry): void {
    this.delegate.set(assignmentCacheKeyToString(entry), assignmentCacheValueToString(entry));
  }

  /**
   * Returns an array with all {@link AssignmentCacheEntry} entries in the cache as an array of
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
