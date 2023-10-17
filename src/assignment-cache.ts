import { LRUCache } from 'lru-cache';

import { EppoValue } from './eppo_value';

export interface AssignmentCacheKey {
  subjectKey: string;
  flagKey: string;
  allocationKey: string;
  variationValue: EppoValue;
}

export abstract class AssignmentCache {
  abstract hasLoggedAssignment(key: AssignmentCacheKey): boolean;
  abstract logAssignment(key: AssignmentCacheKey): void;

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
export class NonExpiringAssignmentCache extends AssignmentCache {
  // key -> variation value hash
  private cache: Map<string, string>;

  constructor() {
    super();
    this.cache = new Map<string, string>();
  }

  hasLoggedAssignment(key: AssignmentCacheKey): boolean {
    // no cache key present
    if (!this.cache.has(this.getCacheKey(key))) {
      return false;
    }

    // the subject has been assigned to a different variation
    // than was previously logged.
    // in this case we need to log the assignment again;
    // clear the cache and return false
    if (this.cache.get(this.getCacheKey(key)) !== key.variationValue.toHashedString()) {
      return false;
    }

    return true;
  }

  logAssignment(key: AssignmentCacheKey): void {
    this.cache.set(this.getCacheKey(key), key.variationValue.toHashedString());
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
export class LRUAssignmentCache extends AssignmentCache {
  private cache: LRUCache<string, string>;

  constructor(maxSize: number) {
    super();
    this.cache = new LRUCache<string, string>({ max: maxSize });
  }

  hasLoggedAssignment(key: AssignmentCacheKey): boolean {
    // no cache key present
    if (!this.cache.has(this.getCacheKey(key))) {
      return false;
    }

    // the subject has been assigned to a different variation
    // than was previously logged.
    // in this case we need to log the assignment again;
    // clear the cache and return false
    if (this.cache.get(this.getCacheKey(key)) !== key.variationValue.toHashedString()) {
      return false;
    }

    return true;
  }

  logAssignment(key: AssignmentCacheKey): void {
    this.cache.set(this.getCacheKey(key), key.variationValue.toHashedString());
  }
}
