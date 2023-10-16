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

  protected getCacheKey({
    subjectKey,
    flagKey,
    allocationKey,
    variationValue,
  }: AssignmentCacheKey): string {
    return [
      `subject:${subjectKey}`,
      `flag:${flagKey}`,
      `allocation:${allocationKey}`,
      `variation:${variationValue.toHashedString()}`,
    ].join('-');
  }
}

/**
 * A cache that never expires.
 *
 * The primary use case is for client-side SDKs, where the cache is only used
 * for a single user.
 */
export class NonExpiringAssignmentCache extends AssignmentCache {
  private cache: Set<string>;

  constructor() {
    super();
    this.cache = new Set();
  }

  hasLoggedAssignment(key: AssignmentCacheKey): boolean {
    return this.cache.has(this.getCacheKey(key));
  }

  logAssignment(key: AssignmentCacheKey): void {
    this.cache.add(this.getCacheKey(key));
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
  private cache: LRUCache<string, boolean>;

  constructor(maxSize: number) {
    super();
    this.cache = new LRUCache<string, boolean>({ max: maxSize });
  }

  hasLoggedAssignment(key: AssignmentCacheKey): boolean {
    return this.cache.has(this.getCacheKey(key));
  }

  logAssignment(key: AssignmentCacheKey): void {
    this.cache.set(this.getCacheKey(key), true);
  }
}
