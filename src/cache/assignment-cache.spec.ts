import { omit } from 'lodash';

import { getMD5Hash } from '../obfuscation';

import { NonExpiringInMemoryAssignmentCache } from './assignment-cache';

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
    expect(cache.get(key1)).toBe(getMD5Hash('d'));
    expect(cache.get(key2)).toBe(getMD5Hash('4'));
    expect(cache.keys()).toEqual([omit(key1, 'variationKey'), omit(key2, 'variationKey')]);
  });
});
