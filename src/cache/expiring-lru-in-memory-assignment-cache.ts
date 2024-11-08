import { AbstractAssignmentCache } from './abstract-assignment-cache';
import { ExpiringLRUCache } from './lru-cache';

/**
 * Variation of LRU caching mechanism that will automatically evict items after
 * set time of milliseconds.
 *
 * It is used to limit the size of the cache.
 *
 * The primary use case is for server-side SDKs, where the cache is shared across
 * multiple users. In this case, the cache size should be set to the maximum number
 * of users that can be active at the same time.
 * @param {number} maxSize - Maximum cache size
 * @param {number} timeout - Time in milliseconds after cache will expire.
 */
export class ExpiringLRUInMemoryAssignmentCache extends AbstractAssignmentCache<ExpiringLRUCache> {
  constructor(maxSize: number, timeout = 60_000) {
    super(new ExpiringLRUCache(maxSize, timeout));
  }
}
