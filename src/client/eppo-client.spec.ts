import { times } from 'lodash';
import * as td from 'testdouble';

import {
  IAssignmentTestCase,
  MOCK_UFC_RESPONSE_FILE,
  OBFUSCATED_MOCK_UFC_RESPONSE_FILE,
  SubjectTestCase,
  getTestAssignmentDetails,
  getTestAssignments,
  readAssignmentTestData,
  readMockUFCResponse,
  validateTestAssignmentDetails,
  validateTestAssignments,
} from '../../test/testHelpers';
import ApiEndpoints from '../api-endpoints';
import { IAssignmentLogger } from '../assignment-logger';
import { IConfigurationStore } from '../configuration-store/configuration-store';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import { MAX_EVENT_QUEUE_SIZE, POLL_INTERVAL_MS, POLL_JITTER_PCT } from '../constants';
import FlagConfigurationRequestor from '../flag-configuration-requestor';
import { AllocationEvaluationCode } from '../flag-evaluation-details-builder';
import FetchHttpClient from '../http-client';
import { Flag, ObfuscatedFlag, VariationType } from '../interfaces';
import { OperatorType } from '../rules';

import EppoClient, {
  AssignmentDetails,
  FlagConfigurationRequestParameters,
  checkTypeMatch,
} from './eppo-client';

export async function init(configurationStore: IConfigurationStore<Flag | ObfuscatedFlag>) {
  const apiEndpoints = new ApiEndpoints({
    baseUrl: 'http://127.0.0.1:4000',
    queryParams: {
      apiKey: 'dummy',
      sdkName: 'js-client-sdk-common',
      sdkVersion: '1.0.0',
    },
  });
  const httpClient = new FetchHttpClient(apiEndpoints, 1000);
  const configurationRequestor = new FlagConfigurationRequestor(configurationStore, httpClient);
  await configurationRequestor.fetchAndStoreConfigurations();
}

describe('EppoClient E2E test', () => {
  global.fetch = jest.fn(() => {
    const ufc = readMockUFCResponse(MOCK_UFC_RESPONSE_FILE);

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(ufc),
    });
  }) as jest.Mock;
  const storage = new MemoryOnlyConfigurationStore<Flag | ObfuscatedFlag>();

  beforeAll(async () => {
    await init(storage);
  });

  const flagKey = 'mock-flag';

  const variationA = {
    key: 'a',
    value: 'variation-a',
  };

  const variationB = {
    key: 'b',
    value: 'variation-b',
  };

  const mockFlag: Flag = {
    key: flagKey,
    enabled: true,
    variationType: VariationType.STRING,
    variations: { a: variationA, b: variationB },
    allocations: [
      {
        key: 'allocation-a',
        rules: [],
        splits: [
          {
            shards: [],
            variationKey: 'a',
          },
        ],
        doLog: true,
      },
    ],
    totalShards: 10000,
  };

  describe('error encountered', () => {
    let client: EppoClient;

    beforeAll(() => {
      storage.setEntries({ [flagKey]: mockFlag });
      client = new EppoClient(storage);

      td.replace(EppoClient.prototype, 'getAssignmentDetail', function () {
        throw new Error('Mock test error');
      });
    });

    afterAll(() => {
      td.reset();
    });

    it('returns default value when graceful failure if error encountered', async () => {
      client.setIsGracefulFailureMode(true);

      expect(client.getBoolAssignment(flagKey, 'subject-identifer', {}, true)).toBe(true);
      expect(client.getBoolAssignment(flagKey, 'subject-identifer', {}, false)).toBe(false);
      expect(client.getBooleanAssignment(flagKey, 'subject-identifer', {}, true)).toBe(true);
      expect(client.getBooleanAssignment(flagKey, 'subject-identifer', {}, false)).toBe(false);
      expect(client.getNumericAssignment(flagKey, 'subject-identifer', {}, 1)).toBe(1);
      expect(client.getNumericAssignment(flagKey, 'subject-identifer', {}, 0)).toBe(0);
      expect(client.getJSONAssignment(flagKey, 'subject-identifer', {}, {})).toEqual({});
      expect(
        client.getJSONAssignment(flagKey, 'subject-identifer', {}, { hello: 'world' }),
      ).toEqual({
        hello: 'world',
      });
      expect(client.getStringAssignment(flagKey, 'subject-identifer', {}, 'default')).toBe(
        'default',
      );
    });

    it('throws error when graceful failure is false', async () => {
      client.setIsGracefulFailureMode(false);

      expect(() => {
        client.getBoolAssignment(flagKey, 'subject-identifer', {}, true);
        client.getBooleanAssignment(flagKey, 'subject-identifer', {}, true);
      }).toThrow();

      expect(() => {
        client.getJSONAssignment(flagKey, 'subject-identifer', {}, {});
      }).toThrow();

      expect(() => {
        client.getNumericAssignment(flagKey, 'subject-identifer', {}, 1);
      }).toThrow();

      expect(() => {
        client.getStringAssignment(flagKey, 'subject-identifer', {}, 'default');
      }).toThrow();
    });
  });

  describe('setLogger', () => {
    beforeAll(() => {
      storage.setEntries({ [flagKey]: mockFlag });
    });

    it('Invokes logger for queued events', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const client = new EppoClient(storage);
      client.getStringAssignment(flagKey, 'subject-to-be-logged', {}, 'default-value');
      client.setLogger(mockLogger);

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].subject).toEqual(
        'subject-to-be-logged',
      );
    });

    it('Does not log same queued event twice', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const client = new EppoClient(storage);

      client.getStringAssignment(flagKey, 'subject-to-be-logged', {}, 'default-value');
      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    });

    it('Does not invoke logger for events that exceed queue size', () => {
      const mockLogger = td.object<IAssignmentLogger>();
      const client = new EppoClient(storage);

      times(MAX_EVENT_QUEUE_SIZE + 100, (i) =>
        client.getStringAssignment(flagKey, `subject-to-be-logged-${i}`, {}, 'default-value'),
      );
      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(MAX_EVENT_QUEUE_SIZE);
    });
  });

  describe('check type match', () => {
    it('returns false when types do not match', () => {
      expect(checkTypeMatch(VariationType.JSON, VariationType.STRING)).toBe(false);
    });
  });

  describe('UFC General Test Cases', () => {
    beforeAll(async () => {
      global.fetch = jest.fn(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(readMockUFCResponse(MOCK_UFC_RESPONSE_FILE)),
        });
      }) as jest.Mock;

      await init(storage);
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    it.each(readAssignmentTestData())(
      'test variation assignment splits',
      async ({ flag, variationType, defaultValue, subjects }: IAssignmentTestCase) => {
        const client = new EppoClient(storage);
        client.setIsGracefulFailureMode(false);

        let assignments: {
          subject: SubjectTestCase;
          assignment: string | boolean | number | null | object;
        }[] = [];

        const typeAssignmentFunctions = {
          [VariationType.BOOLEAN]: client.getBooleanAssignment.bind(client),
          [VariationType.NUMERIC]: client.getNumericAssignment.bind(client),
          [VariationType.INTEGER]: client.getIntegerAssignment.bind(client),
          [VariationType.STRING]: client.getStringAssignment.bind(client),
          [VariationType.JSON]: client.getJSONAssignment.bind(client),
        };

        const assignmentFn = typeAssignmentFunctions[variationType];
        if (!assignmentFn) {
          throw new Error(`Unknown variation type: ${variationType}`);
        }

        assignments = getTestAssignments(
          { flag, variationType, defaultValue, subjects },
          assignmentFn,
        );

        validateTestAssignments(assignments, flag);
      },
    );
  });

  describe('UFC Obfuscated Test Cases', () => {
    beforeAll(async () => {
      global.fetch = jest.fn(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(readMockUFCResponse(OBFUSCATED_MOCK_UFC_RESPONSE_FILE)),
        });
      }) as jest.Mock;

      await init(storage);
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    it.each(readAssignmentTestData())(
      'test variation assignment splits',
      async ({ flag, variationType, defaultValue, subjects }: IAssignmentTestCase) => {
        const client = new EppoClient(storage, undefined, true);
        client.setIsGracefulFailureMode(false);

        const typeAssignmentFunctions = {
          [VariationType.BOOLEAN]: client.getBooleanAssignment.bind(client),
          [VariationType.NUMERIC]: client.getNumericAssignment.bind(client),
          [VariationType.INTEGER]: client.getIntegerAssignment.bind(client),
          [VariationType.STRING]: client.getStringAssignment.bind(client),
          [VariationType.JSON]: client.getJSONAssignment.bind(client),
        };

        const assignmentFn = typeAssignmentFunctions[variationType];
        if (!assignmentFn) {
          throw new Error(`Unknown variation type: ${variationType}`);
        }

        const assignments = getTestAssignments(
          { flag, variationType, defaultValue, subjects },
          assignmentFn,
        );

        validateTestAssignments(assignments, flag);
      },
    );
  });

  it('returns null if getStringAssignment was called for the subject before any UFC was loaded', () => {
    const localClient = new EppoClient(new MemoryOnlyConfigurationStore());
    expect(localClient.getStringAssignment(flagKey, 'subject-1', {}, 'hello world')).toEqual(
      'hello world',
    );
    expect(localClient.isInitialized()).toBe(false);
  });

  it('returns default value when key does not exist', async () => {
    const client = new EppoClient(storage);

    const nonExistentFlag = 'non-existent-flag';

    expect(client.getBoolAssignment(nonExistentFlag, 'subject-identifer', {}, true)).toBe(true);
    expect(client.getBooleanAssignment(nonExistentFlag, 'subject-identifer', {}, true)).toBe(true);
    expect(client.getNumericAssignment(nonExistentFlag, 'subject-identifer', {}, 1)).toBe(1);
    expect(client.getJSONAssignment(nonExistentFlag, 'subject-identifer', {}, {})).toEqual({});
    expect(client.getStringAssignment(nonExistentFlag, 'subject-identifer', {}, 'default')).toBe(
      'default',
    );
  });

  it('logs variation assignment and experiment key', () => {
    const mockLogger = td.object<IAssignmentLogger>();

    storage.setEntries({ [flagKey]: mockFlag });
    const client = new EppoClient(storage);
    client.setLogger(mockLogger);

    const subjectAttributes = { foo: 3 };
    const assignment = client.getStringAssignment(
      flagKey,
      'subject-10',
      subjectAttributes,
      'default',
    );

    expect(assignment).toEqual(variationA.value);
    expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);

    const loggedAssignmentEvent = td.explain(mockLogger.logAssignment).calls[0].args[0];
    expect(loggedAssignmentEvent.subject).toEqual('subject-10');
    expect(loggedAssignmentEvent.featureFlag).toEqual(flagKey);
    expect(loggedAssignmentEvent.experiment).toEqual(`${flagKey}-${mockFlag.allocations[0].key}`);
    expect(loggedAssignmentEvent.allocation).toEqual(mockFlag.allocations[0].key);
  });

  it('handles logging exception', () => {
    const mockLogger = td.object<IAssignmentLogger>();
    td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(new Error('logging error'));

    storage.setEntries({ [flagKey]: mockFlag });
    const client = new EppoClient(storage);
    client.setLogger(mockLogger);

    const subjectAttributes = { foo: 3 };
    const assignment = client.getStringAssignment(
      flagKey,
      'subject-10',
      subjectAttributes,
      'default',
    );

    expect(assignment).toEqual('variation-a');
  });

  it('exports flag configuration', () => {
    storage.setEntries({ [flagKey]: mockFlag });
    const client = new EppoClient(storage);
    expect(client.getFlagConfigurations()).toEqual({ [flagKey]: mockFlag });
  });

  describe('assignment logging deduplication', () => {
    let client: EppoClient;
    let mockLogger: IAssignmentLogger;

    beforeEach(() => {
      mockLogger = td.object<IAssignmentLogger>();

      storage.setEntries({ [flagKey]: mockFlag });
      client = new EppoClient(storage);
      client.setLogger(mockLogger);
    });

    it('logs duplicate assignments without an assignment cache', async () => {
      client.disableAssignmentCache();

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');

      // call count should be 2 because there is no cache.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('does not log duplicate assignments', async () => {
      client.useNonExpiringInMemoryAssignmentCache();
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      // call count should be 1 because the second call is a cache hit and not logged.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    });

    it('logs assignment again after the lru cache is full', () => {
      client.useLRUInMemoryAssignmentCache(2);

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // logged
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // cached

      client.getStringAssignment(flagKey, 'subject-11', {}, 'default'); // logged
      client.getStringAssignment(flagKey, 'subject-11', {}, 'default'); // cached

      client.getStringAssignment(flagKey, 'subject-12', {}, 'default'); // cache evicted subject-10, logged
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // previously evicted, logged
      client.getStringAssignment(flagKey, 'subject-12', {}, 'default'); // cached

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(4);
    });

    it('does not cache assignments if the logger had an exception', () => {
      td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(
        new Error('logging error'),
      );

      client.setLogger(mockLogger);

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');

      // call count should be 2 because the first call had an exception
      // therefore we are not sure the logger was successful and try again.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('logs for each unique flag', async () => {
      await storage.setEntries({
        [flagKey]: mockFlag,
        'flag-2': {
          ...mockFlag,
          key: 'flag-2',
        },
        'flag-3': {
          ...mockFlag,
          key: 'flag-3',
        },
      });

      client.useNonExpiringInMemoryAssignmentCache();

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      client.getStringAssignment('flag-2', 'subject-10', {}, 'default');
      client.getStringAssignment('flag-2', 'subject-10', {}, 'default');
      client.getStringAssignment('flag-3', 'subject-10', {}, 'default');
      client.getStringAssignment('flag-3', 'subject-10', {}, 'default');
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      client.getStringAssignment('flag-2', 'subject-10', {}, 'default');
      client.getStringAssignment('flag-3', 'subject-10', {}, 'default');

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(3);
    });

    it('logs twice for the same flag when allocations change', () => {
      client.useNonExpiringInMemoryAssignmentCache();

      storage.setEntries({
        [flagKey]: {
          ...mockFlag,

          allocations: [
            {
              key: 'allocation-a-2',
              rules: [],
              splits: [
                {
                  shards: [],
                  variationKey: 'a',
                },
              ],
              doLog: true,
            },
          ],
        },
      });
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');

      storage.setEntries({
        [flagKey]: {
          ...mockFlag,
          allocations: [
            {
              key: 'allocation-a-3',
              rules: [],
              splits: [
                {
                  shards: [],
                  variationKey: 'a',
                },
              ],
              doLog: true,
            },
          ],
        },
      });
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default');
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('logs the same subject/flag/variation after two changes', () => {
      client.useNonExpiringInMemoryAssignmentCache();

      // original configuration version
      storage.setEntries({ [flagKey]: mockFlag });

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // log this assignment
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // cache hit, don't log

      // change the variation
      storage.setEntries({
        [flagKey]: {
          ...mockFlag,
          allocations: [
            {
              key: 'allocation-a', // note: same key
              rules: [],
              splits: [
                {
                  shards: [],
                  variationKey: 'b', // but different variation!
                },
              ],
              doLog: true,
            },
          ],
        },
      });

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // log this assignment
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // cache hit, don't log

      // change the flag again, back to the original
      storage.setEntries({ [flagKey]: mockFlag });

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // important: log this assignment
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // cache hit, don't log

      // change the allocation
      storage.setEntries({
        [flagKey]: {
          ...mockFlag,
          allocations: [
            {
              key: 'allocation-b', // note: different key
              rules: [],
              splits: [
                {
                  shards: [],
                  variationKey: 'b', // variation has been seen before
                },
              ],
              doLog: true,
            },
          ],
        },
      });

      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // log this assignment
      client.getStringAssignment(flagKey, 'subject-10', {}, 'default'); // cache hit, don't log

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(4);
    });
  });

  describe('Eppo Client constructed with configuration request parameters', () => {
    let client: EppoClient;
    let thisStorage: IConfigurationStore<Flag | ObfuscatedFlag>;
    let requestConfiguration: FlagConfigurationRequestParameters;

    const flagKey = 'numeric_flag';
    const subject = 'alice';
    const pi = 3.1415926;

    const maxRetryDelay = POLL_INTERVAL_MS * POLL_JITTER_PCT;

    beforeAll(async () => {
      global.fetch = jest.fn(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(readMockUFCResponse(MOCK_UFC_RESPONSE_FILE)),
        });
      }) as jest.Mock;
    });

    beforeEach(async () => {
      requestConfiguration = {
        apiKey: 'dummy key',
        sdkName: 'js-client-sdk-common',
        sdkVersion: '1.0.0',
      };

      thisStorage = new MemoryOnlyConfigurationStore();

      // We only want to fake setTimeout() and clearTimeout()
      jest.useFakeTimers({
        advanceTimers: true,
        doNotFake: [
          'Date',
          'hrtime',
          'nextTick',
          'performance',
          'queueMicrotask',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'requestIdleCallback',
          'cancelIdleCallback',
          'setImmediate',
          'clearImmediate',
          'setInterval',
          'clearInterval',
        ],
      });
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    it('Fetches initial configuration with parameters in constructor', async () => {
      client = new EppoClient(thisStorage, requestConfiguration);
      client.setIsGracefulFailureMode(false);
      // no configuration loaded
      let variation = client.getNumericAssignment(flagKey, subject, {}, 123.4);
      expect(variation).toBe(123.4);
      // have client fetch configurations
      await client.fetchFlagConfigurations();
      variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
      expect(variation).toBe(pi);
    });

    it('Fetches initial configuration with parameters provided later', async () => {
      client = new EppoClient(thisStorage);
      client.setIsGracefulFailureMode(false);
      client.setConfigurationRequestParameters(requestConfiguration);
      // no configuration loaded
      let variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
      expect(variation).toBe(0.0);
      // have client fetch configurations
      await client.fetchFlagConfigurations();
      variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
      expect(variation).toBe(pi);
    });

    it('Does not fetch configurations if the configuration store is unexpired', async () => {
      class MockStore extends MemoryOnlyConfigurationStore<Flag | ObfuscatedFlag> {
        async isExpired(): Promise<boolean> {
          return false;
        }
      }

      client = new EppoClient(new MockStore(), requestConfiguration);
      client.setIsGracefulFailureMode(false);
      // no configuration loaded
      let variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
      expect(variation).toBe(0.0);
      // have client fetch configurations
      await client.fetchFlagConfigurations();
      variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
      expect(variation).toBe(0.0);
    });

    it.each([
      { pollAfterSuccessfulInitialization: false },
      { pollAfterSuccessfulInitialization: true },
    ])('retries initial configuration request with config %p', async (configModification) => {
      let callCount = 0;

      global.fetch = jest.fn(() => {
        if (++callCount === 1) {
          // Simulate an error for the first call
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.reject(new Error('Server error')),
          });
        } else {
          // Return a successful response for subsequent calls
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => {
              return readMockUFCResponse(MOCK_UFC_RESPONSE_FILE);
            },
          });
        }
      }) as jest.Mock;

      const { pollAfterSuccessfulInitialization } = configModification;
      requestConfiguration = {
        ...requestConfiguration,
        pollAfterSuccessfulInitialization,
      };
      client = new EppoClient(thisStorage, requestConfiguration);
      client.setIsGracefulFailureMode(false);
      // no configuration loaded
      let variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
      expect(variation).toBe(0.0);

      // By not awaiting (yet) only the first attempt should be fired off before test execution below resumes
      const fetchPromise = client.fetchFlagConfigurations();

      // Advance timers mid-init to allow retrying
      await jest.advanceTimersByTimeAsync(maxRetryDelay);

      // Await so it can finish its initialization before this test proceeds
      await fetchPromise;

      variation = client.getNumericAssignment(flagKey, subject, {}, 0.0);
      expect(variation).toBe(pi);
      expect(callCount).toBe(2);

      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      // By default, no more polling
      expect(callCount).toBe(pollAfterSuccessfulInitialization ? 3 : 2);
    });

    it.each([
      {
        pollAfterFailedInitialization: false,
        throwOnFailedInitialization: false,
      },
      { pollAfterFailedInitialization: false, throwOnFailedInitialization: true },
      { pollAfterFailedInitialization: true, throwOnFailedInitialization: false },
      { pollAfterFailedInitialization: true, throwOnFailedInitialization: true },
    ])('initial configuration request fails with config %p', async (configModification) => {
      let callCount = 0;

      global.fetch = jest.fn(() => {
        if (++callCount === 1) {
          // Simulate an error for the first call
          return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.reject(new Error('Server error')),
          } as Response);
        } else {
          // Return a successful response for subsequent calls
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(readMockUFCResponse(MOCK_UFC_RESPONSE_FILE)),
          } as Response);
        }
      });

      const { pollAfterFailedInitialization, throwOnFailedInitialization } = configModification;

      // Note: fake time does not play well with errors bubbled up after setTimeout (event loop,
      // timeout queue, message queue stuff) so we don't allow retries when rethrowing.
      const numInitialRequestRetries = 0;

      requestConfiguration = {
        ...requestConfiguration,
        numInitialRequestRetries,
        throwOnFailedInitialization,
        pollAfterFailedInitialization,
      };
      client = new EppoClient(thisStorage, requestConfiguration);
      client.setIsGracefulFailureMode(false);
      // no configuration loaded
      expect(client.getNumericAssignment(flagKey, subject, {}, 0.0)).toBe(0.0);

      // By not awaiting (yet) only the first attempt should be fired off before test execution below resumes
      if (throwOnFailedInitialization) {
        await expect(client.fetchFlagConfigurations()).rejects.toThrow();
      } else {
        await expect(client.fetchFlagConfigurations()).resolves.toBeUndefined();
      }
      expect(callCount).toBe(1);
      // still no configuration loaded
      expect(client.getNumericAssignment(flagKey, subject, {}, 10.0)).toBe(10.0);

      // Advance timers so a post-init poll can take place
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 1.5);

      // if pollAfterFailedInitialization = true, we will poll later and get a config, otherwise not
      expect(callCount).toBe(pollAfterFailedInitialization ? 2 : 1);
      expect(client.getNumericAssignment(flagKey, subject, {}, 0.0)).toBe(
        pollAfterFailedInitialization ? pi : 0.0,
      );
    });
  });
});
