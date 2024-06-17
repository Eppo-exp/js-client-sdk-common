import { getMD5Hash } from '../obfuscation';

import { NonExpiringInMemoryAssignmentCache } from './abstract-assignment-cache';

describe('NonExpiringInMemoryAssignmentCache', () => {
  it('read and write entries', () => {
    const cache = new NonExpiringInMemoryAssignmentCache();
    const key1 = { subjectKey: 'a', flagKey: 'b', allocationKey: 'c', variationKey: 'd' };
    const key2 = { subjectKey: '1', flagKey: '2', allocationKey: '3', variationKey: '4' };
    cache.set(key1);
    expect(cache.has(key1)).toBeTruthy();
    expect(cache.has(key2)).toBeFalsy();
    cache.set(key2);
    expect(cache.has(key2)).toBeTruthy();
    // this makes an assumption about the internal implementation of the cache, which is not ideal
    // but it's the only way to test the cache without exposing the internal state
    expect(cache.keys()).toEqual([getMD5Hash('a;b;c;d'), getMD5Hash('1;2;3;4')]);
  });
});
