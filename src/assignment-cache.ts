import { LRUCache } from 'lru-cache';

import { EppoValue } from './eppo_value';

export interface AssignmentCacheKey {
  subjectKey: string;
  flagKey: string;
  allocationKey: string;
  variationValue: EppoValue;
}

interface Cacheable {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  has(key: string): boolean;
}

export type AvailableCacheTypes = Map<string, string> | LRUCache<string, string>;

export abstract class AssignmentCache<T extends Cacheable> {
  // key -> variation value hash
  protected cache: T;

  constructor(cacheInstance: T) {
    this.cache = cacheInstance;
  }

  hasLoggedAssignment(key: AssignmentCacheKey): boolean {
    // no cache key present
    if (!this.cache.has(this.getCacheKey(key))) {
      return false;
    }

    // the subject has been assigned to a different variation
    // than was previously logged.
    // in this case we need to log the assignment again.
    if (this.cache.get(this.getCacheKey(key)) !== key.variationValue.toHashedString()) {
      return false;
    }

    return true;
  }

  logAssignment(key: AssignmentCacheKey): void {
    this.cache.set(this.getCacheKey(key), key.variationValue.toHashedString());
  }

  protected getCacheKey({ subjectKey, flagKey, allocationKey }: AssignmentCacheKey): string {
    return [`subject:${subjectKey}`, `flag:${flagKey}`, `allocation:${allocationKey}`].join(';');
  }
}

/**
 * A cache that never expires.
 *
 * The primary use case is for client-side SDKs, where the cache is only used
 * for a single user.
 */
export class NonExpiringAssignmentCache extends AssignmentCache<Map<string, string>> {
  constructor() {
    super(new Map<string, string>());
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
export class LRUAssignmentCache extends AssignmentCache<LRUCache<string, string>> {
  constructor(maxSize: number) {
    super(new LRUCache<string, string>({ max: maxSize }));
  }
}
