import { LRUCache } from './lru-cache';
import { getMD5Hash } from './obfuscation';

export interface AssignmentCacheKey {
  subjectKey: string;
  flagKey: string;
  allocationKey: string;
  variationKey: string;
}

export interface Cacheable {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

export abstract class AssignmentCache<T extends Cacheable> {
  // key -> variation value hash
  protected cache: T;

  constructor(cacheInstance: T) {
    this.cache = cacheInstance;
  }

  async hasLoggedAssignment(key: AssignmentCacheKey): Promise<boolean> {
    // no cache key present

    if (!this.cache.has(this.getCacheKey(key))) {
      return false;
    }

    // the subject has been assigned to a different variation
    // than was previously logged.
    // in this case we need to log the assignment again.
    const cachedValue = await this.cache.get(this.getCacheKey(key));
    if (cachedValue !== getMD5Hash(key.variationKey)) {
      return false;
    }

    return true;
  }

  async setLastLoggedAssignment(key: AssignmentCacheKey): Promise<void> {
    await this.cache.set(this.getCacheKey(key), getMD5Hash(key.variationKey));
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

export class AsyncMap implements Cacheable {
  private map: Map<string, string>;

  constructor() {
    this.map = new Map<string, string>();
  }

  async get(key: string): Promise<string | undefined> {
    return this.map.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async has(key: string): Promise<boolean> {
    return this.map.has(key);
  }
}
export class NonExpiringInMemoryAssignmentCache extends AssignmentCache<AsyncMap> {
  constructor() {
    super(new AsyncMap());
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
export class AsyncLRUCache implements Cacheable {
  private cache: LRUCache;

  constructor(maxSize: number) {
    this.cache = new LRUCache(maxSize);
  }

  async get(key: string): Promise<string | undefined> {
    return this.cache.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.cache.set(key, value);
  }

  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }
}
export class LRUInMemoryAssignmentCache extends AssignmentCache<AsyncLRUCache> {
  constructor(maxSize: number) {
    super(new AsyncLRUCache(maxSize));
  }
}
