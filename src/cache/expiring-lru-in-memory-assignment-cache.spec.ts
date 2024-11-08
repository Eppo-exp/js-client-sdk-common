import { ExpiringLRUInMemoryAssignmentCache } from './expiring-lru-in-memory-assignment-cache';

describe('ExpiringLRUInMemoryAssignmentCache', () => {
  let cache: ExpiringLRUInMemoryAssignmentCache;
  const defaultTimout = 60_000; // 10 minutes

  beforeAll(() => {
    jest.useFakeTimers();
    cache = new ExpiringLRUInMemoryAssignmentCache(2);
  });

  it(`assignment cache's timeout should default to 10 minutes `, () => {
    const key1 = { subjectKey: 'a', flagKey: 'b', banditKey: 'c', actionKey: 'd' };
    cache.set(key1);
    jest.advanceTimersByTime(defaultTimout);
    expect(cache.has(key1)).toBeFalsy();
  });

  it(`assignment cache's timeout value is used on construction`, () => {
    const expectedTimout = 88;
    cache = new ExpiringLRUInMemoryAssignmentCache(2, expectedTimout);
    const key1 = { subjectKey: 'a', flagKey: 'b', banditKey: 'c', actionKey: 'd' };
    cache.set(key1);
    jest.advanceTimersByTime(expectedTimout);
    expect(cache.has(key1)).toBeFalsy();
  });

  it(`cache shouldn't be invalidated before timeout`, () => {
    const key1 = { subjectKey: 'a', flagKey: 'b', banditKey: 'c', actionKey: 'd' };
    cache.set(key1);

    expect(cache.has(key1)).toBeTruthy();

    jest.advanceTimersByTime(defaultTimout);
    expect(cache.has(key1)).toBeFalsy();
  });
});
