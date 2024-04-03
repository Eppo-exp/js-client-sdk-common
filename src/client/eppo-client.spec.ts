/**
 * @jest-environment jsdom
 */
import axios from 'axios';
import * as td from 'testdouble';
import mock, { MockResponse } from 'xhr-mock';

import {
  IAssignmentTestCase,
  MOCK_UFC_RESPONSE_FILE,
  OBFUSCATED_MOCK_UFC_RESPONSE_FILE,
  SubjectTestCase,
  readAssignmentTestData,
  readMockUFCResponse,
} from '../../test/testHelpers';
import { IAssignmentHooks } from '../assignment-hooks';
import { IAssignmentLogger } from '../assignment-logger';
import { IConfigurationStore } from '../configuration-store';
import { MAX_EVENT_QUEUE_SIZE, POLL_INTERVAL_MS, POLL_JITTER_PCT } from '../constants';
import { Evaluator } from '../evaluator';
import FlagConfigurationRequestor from '../flag-configuration-requestor';
import HttpClient from '../http-client';
import { Flag, VariationType } from '../interfaces';

import EppoClient, { FlagConfigurationRequestParameters } from './eppo-client';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require('../../package.json');

const flagEndpoint = /flag_config\/v1\/config*/;

class TestConfigurationStore implements IConfigurationStore {
  private store: Record<string, string> = {};

  public get<T>(key: string): T {
    const rval = this.store[key];
    return rval ? JSON.parse(rval) : null;
  }

  public setEntries<T>(entries: Record<string, T>) {
    Object.entries(entries).forEach(([key, val]) => {
      this.store[key] = JSON.stringify(val);
    });
  }

  public getKeys(): string[] {
    return Object.keys(this.store);
  }
}

function getTestAssignments(
  testCase: IAssignmentTestCase,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assignmentFn: any,
  obfuscated = false,
): { subject: SubjectTestCase; assignment: string | boolean | number | null | object }[] {
  const assignments: {
    subject: SubjectTestCase;
    assignment: string | boolean | number | null | object;
  }[] = [];
  for (const subject of testCase.subjects) {
    const assignment = assignmentFn(
      subject.subjectKey,
      testCase.flag,
      testCase.defaultValue,
      subject.subjectAttributes,
      obfuscated,
    );
    assignments.push({ subject: subject, assignment: assignment });
  }
  return assignments;
}

export async function init(configurationStore: IConfigurationStore) {
  const axiosInstance = axios.create({
    baseURL: 'http://127.0.0.1:4000',
    timeout: 1000,
  });

  const httpClient = new HttpClient(axiosInstance, {
    apiKey: 'dummy',
    sdkName: 'js-client-sdk-common',
    sdkVersion: packageJson.version,
  });

  const configurationRequestor = new FlagConfigurationRequestor(configurationStore, httpClient);
  await configurationRequestor.fetchAndStoreConfigurations();
}

describe('EppoClient E2E test', () => {
  const evaluator = new Evaluator();
  const storage = new TestConfigurationStore();
  const globalClient = new EppoClient(evaluator, storage);

  beforeAll(async () => {
    mock.setup();
    mock.get(flagEndpoint, (_req, res) => {
      const ufc = readMockUFCResponse(MOCK_UFC_RESPONSE_FILE);
      return res.status(200).body(JSON.stringify(ufc));
    });

    await init(storage);
  });

  afterAll(() => {
    mock.teardown();
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
    const mockHooks = td.object<IAssignmentHooks>();

    beforeAll(() => {
      storage.setEntries({ [flagKey]: mockFlag });
      const evaluator = new Evaluator();
      client = new EppoClient(evaluator, storage);

      td.replace(EppoClient.prototype, 'getAssignmentDetail', function () {
        throw new Error('Mock test error');
      });
    });

    afterAll(() => {
      td.reset();
    });

    it('returns default value when graceful failure if error encounterd', async () => {
      client.setIsGracefulFailureMode(true);

      expect(client.getBoolAssignment('subject-identifer', flagKey, true, {})).toBe(true);
      expect(client.getBoolAssignment('subject-identifer', flagKey, false, {})).toBe(false);
      expect(client.getNumericAssignment('subject-identifer', flagKey, 1, {})).toBe(1);
      expect(client.getNumericAssignment('subject-identifer', flagKey, 0, {})).toBe(0);
      expect(client.getJSONAssignment('subject-identifer', flagKey, {}, {})).toEqual({});
      expect(
        client.getJSONAssignment('subject-identifer', flagKey, { hello: 'world' }, {}),
      ).toEqual({ hello: 'world' });
      expect(client.getStringAssignment('subject-identifer', flagKey, 'default', {})).toBe(
        'default',
      );
    });

    it('throws error when graceful failure is false', async () => {
      client.setIsGracefulFailureMode(false);

      expect(() => {
        client.getBoolAssignment('subject-identifer', flagKey, true, {});
      }).toThrow();

      expect(() => {
        client.getJSONAssignment('subject-identifer', flagKey, {}, {});
      }).toThrow();

      expect(() => {
        client.getNumericAssignment('subject-identifer', flagKey, 1, {});
      }).toThrow();

      expect(() => {
        client.getStringAssignment('subject-identifer', flagKey, 'default', {});
      }).toThrow();
    });
  });

  describe('setLogger', () => {
    beforeAll(() => {
      storage.setEntries({ [flagKey]: mockFlag });
    });

    it('Invokes logger for queued events', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const evaluator = new Evaluator();
      const client = new EppoClient(evaluator, storage);
      client.getStringAssignment('subject-to-be-logged', flagKey, 'default-value');
      client.setLogger(mockLogger);

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].subject).toEqual(
        'subject-to-be-logged',
      );
    });

    it('Does not log same queued event twice', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const evaluator = new Evaluator();
      const client = new EppoClient(evaluator, storage);

      client.getStringAssignment('subject-to-be-logged', flagKey, 'default-value');
      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);

      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    });

    it('Does not invoke logger for events that exceed queue size', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const evaluator = new Evaluator();
      const client = new EppoClient(evaluator, storage);

      for (let i = 0; i < MAX_EVENT_QUEUE_SIZE + 100; i++) {
        client.getStringAssignment(`subject-to-be-logged-${i}`, flagKey, 'default-value');
      }
      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(MAX_EVENT_QUEUE_SIZE);
    });
  });

  describe('UFC General Test Cases', () => {
    it.each(readAssignmentTestData())(
      'test variation assignment splits',
      async ({ flag, variationType, defaultValue, subjects }: IAssignmentTestCase) => {
        `---- Test Case for ${flag} Experiment ----`;

        const evaluator = new Evaluator();
        const client = new EppoClient(evaluator, storage);

        let assignments: {
          subject: SubjectTestCase;
          assignment: string | boolean | number | null | object;
        }[] = [];

        const typeAssignmentFunctions = {
          [VariationType.BOOLEAN]: client.getBoolAssignment.bind(client),
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
          false,
        );

        for (const { subject, assignment } of assignments) {
          expect(assignment).toEqual(subject.assignment);
        }
      },
    );
  });

  describe('UFC Obfuscated Test Cases', () => {
    const storage = new TestConfigurationStore();
    const evaluator = new Evaluator();
    const globalClient = new EppoClient(evaluator, storage);

    beforeAll(async () => {
      mock.setup();
      mock.get(flagEndpoint, (_req, res) => {
        const ufc = readMockUFCResponse(OBFUSCATED_MOCK_UFC_RESPONSE_FILE);
        console.log(ufc);
        return res.status(200).body(JSON.stringify(ufc));
      });
      await init(storage);
    });

    afterAll(() => {
      mock.teardown();
    });

    it.each(readAssignmentTestData())(
      'test variation assignment splits',
      async ({ flag, variationType, defaultValue, subjects }: IAssignmentTestCase) => {
        `---- Test Case for ${flag} Experiment ----`;

        const evaluator = new Evaluator();
        const client = new EppoClient(evaluator, storage);

        const typeAssignmentFunctions = {
          [VariationType.BOOLEAN]: client.getBoolAssignment.bind(client),
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
          true,
        );

        for (const { subject, assignment } of assignments) {
          expect(assignment).toEqual(subject.assignment);
        }
      },
    );
  });

  // it('returns null if getStringAssignment was called for the subject before any RAC was loaded', () => {
  //   expect(
  //     globalClient.getStringAssignment(sessionOverrideSubject, sessionOverrideExperiment),
  //   ).toEqual(null);
  // });

  it('returns default value when key does not exist', async () => {
    const evaluator = new Evaluator();
    const client = new EppoClient(evaluator, storage);

    const nonExistantFlag = 'non-existent-flag';

    expect(client.getBoolAssignment('subject-identifer', nonExistantFlag, true, {})).toBe(true);
    expect(client.getNumericAssignment('subject-identifer', nonExistantFlag, 1, {})).toBe(1);
    expect(client.getJSONAssignment('subject-identifer', nonExistantFlag, {}, {})).toEqual({});
    expect(client.getStringAssignment('subject-identifer', nonExistantFlag, 'default', {})).toBe(
      'default',
    );
  });

  it('logs variation assignment and experiment key', () => {
    const mockLogger = td.object<IAssignmentLogger>();

    storage.setEntries({ [flagKey]: mockFlag });
    const evaluator = new Evaluator();
    const client = new EppoClient(evaluator, storage);
    client.setLogger(mockLogger);

    const subjectAttributes = { foo: 3 };
    const assignment = client.getStringAssignment(
      'subject-10',
      flagKey,
      'default',
      subjectAttributes,
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
    const evaluator = new Evaluator();
    const client = new EppoClient(evaluator, storage);
    client.setLogger(mockLogger);

    const subjectAttributes = { foo: 3 };
    const assignment = client.getStringAssignment(
      'subject-10',
      flagKey,
      'default',
      subjectAttributes,
    );

    expect(assignment).toEqual('variation-a');
  });

  describe('assignment logging deduplication', () => {
    let client: EppoClient;
    let evaluator: Evaluator;
    let mockLogger: IAssignmentLogger;

    beforeEach(() => {
      mockLogger = td.object<IAssignmentLogger>();

      storage.setEntries({ [flagKey]: mockFlag });
      evaluator = new Evaluator();
      client = new EppoClient(evaluator, storage);
      client.setLogger(mockLogger);
    });

    it('logs duplicate assignments without an assignment cache', () => {
      client.disableAssignmentCache();

      client.getStringAssignment('subject-10', flagKey, 'default');
      client.getStringAssignment('subject-10', flagKey, 'default');

      // call count should be 2 because there is no cache.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('does not log duplicate assignments', () => {
      client.useNonExpiringInMemoryAssignmentCache();

      client.getStringAssignment('subject-10', flagKey, 'default');
      client.getStringAssignment('subject-10', flagKey, 'default');

      // call count should be 1 because the second call is a cache hit and not logged.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    });

    it('logs assignment again after the lru cache is full', () => {
      client.useLRUInMemoryAssignmentCache(2);

      client.getStringAssignment('subject-10', flagKey, 'default'); // logged
      client.getStringAssignment('subject-10', flagKey, 'default'); // cached

      client.getStringAssignment('subject-11', flagKey, 'default'); // logged
      client.getStringAssignment('subject-11', flagKey, 'default'); // cached

      client.getStringAssignment('subject-12', flagKey, 'default'); // cache evicted subject-10, logged
      client.getStringAssignment('subject-10', flagKey, 'default'); // previously evicted, logged
      client.getStringAssignment('subject-12', flagKey, 'default'); // cached

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(4);
    });

    it('does not cache assignments if the logger had an exception', () => {
      td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(
        new Error('logging error'),
      );

      client.setLogger(mockLogger);

      client.getStringAssignment('subject-10', flagKey, 'default');
      client.getStringAssignment('subject-10', flagKey, 'default');

      // call count should be 2 because the first call had an exception
      // therefore we are not sure the logger was successful and try again.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('logs for each unique flag', () => {
      storage.setEntries({
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

      client.getStringAssignment('subject-10', flagKey, 'default');
      client.getStringAssignment('subject-10', flagKey, 'default');
      client.getStringAssignment('subject-10', 'flag-2', 'default');
      client.getStringAssignment('subject-10', 'flag-2', 'default');
      client.getStringAssignment('subject-10', 'flag-3', 'default');
      client.getStringAssignment('subject-10', 'flag-3', 'default');
      client.getStringAssignment('subject-10', flagKey, 'default');
      client.getStringAssignment('subject-10', 'flag-2', 'default');
      client.getStringAssignment('subject-10', 'flag-3', 'default');

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
      client.getStringAssignment('subject-10', flagKey, 'default');

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
      client.getStringAssignment('subject-10', flagKey, 'default');
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('logs the same subject/flag/variation after two changes', () => {
      client.useNonExpiringInMemoryAssignmentCache();

      // original configuration version
      storage.setEntries({ [flagKey]: mockFlag });

      client.getStringAssignment('subject-10', flagKey, 'default'); // log this assignment
      client.getStringAssignment('subject-10', flagKey, 'default'); // cache hit, don't log

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

      client.getStringAssignment('subject-10', flagKey, 'default'); // log this assignment
      client.getStringAssignment('subject-10', flagKey, 'default'); // cache hit, don't log

      // change the flag again, back to the original
      storage.setEntries({ [flagKey]: mockFlag });

      client.getStringAssignment('subject-10', flagKey, 'default'); // important: log this assignment
      client.getStringAssignment('subject-10', flagKey, 'default'); // cache hit, don't log

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

      client.getStringAssignment('subject-10', flagKey, 'default'); // log this assignment
      client.getStringAssignment('subject-10', flagKey, 'default'); // cache hit, don't log

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(4);
    });
  });

  describe('Eppo Client constructed with configuration request parameters', () => {
    let client: EppoClient;
    let storage: IConfigurationStore;
    let requestConfiguration: FlagConfigurationRequestParameters;
    let mockServerResponseFunc: (res: MockResponse) => MockResponse;

    const evaluator = new Evaluator();
    const ufcBody = JSON.stringify(readMockUFCResponse(MOCK_UFC_RESPONSE_FILE));
    const flagKey = 'numeric_flag';
    const subject = 'alice';
    const pi = 3.1415926;

    const maxRetryDelay = POLL_INTERVAL_MS * POLL_JITTER_PCT;

    beforeAll(() => {
      mock.setup();
      mock.get(flagEndpoint, (_req, res) => {
        return mockServerResponseFunc(res);
      });
    });

    beforeEach(() => {
      storage = new TestConfigurationStore();
      requestConfiguration = {
        apiKey: 'dummy key',
        sdkName: 'js-client-sdk-common',
        sdkVersion: packageJson.version,
      };
      mockServerResponseFunc = (res) => res.status(200).body(ufcBody);

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
      mock.teardown();
    });

    it('Fetches initial configuration with parameters in constructor', async () => {
      client = new EppoClient(evaluator, storage, requestConfiguration);
      client.setIsGracefulFailureMode(false);
      // no configuration loaded
      let variation = client.getNumericAssignment(subject, flagKey, 0.0);
      expect(variation).toBe(0.0);
      // have client fetch configurations
      await client.fetchFlagConfigurations();
      variation = client.getNumericAssignment(subject, flagKey, 0.0);
      expect(variation).toBe(pi);
    });

    it('Fetches initial configuration with parameters provided later', async () => {
      client = new EppoClient(evaluator, storage);
      client.setIsGracefulFailureMode(false);
      client.setConfigurationRequestParameters(requestConfiguration);
      // no configuration loaded
      let variation = client.getNumericAssignment(subject, flagKey, 0.0);
      expect(variation).toBe(0.0);
      // have client fetch configurations
      await client.fetchFlagConfigurations();
      variation = client.getNumericAssignment(subject, flagKey, 0.0);
      expect(variation).toBe(pi);
    });

    it.each([
      { pollAfterSuccessfulInitialization: false },
      { pollAfterSuccessfulInitialization: true },
    ])('retries initial configuration request with config %p', async (configModification) => {
      let callCount = 0;
      mockServerResponseFunc = (res) => {
        if (++callCount === 1) {
          // Throw an error for the first call
          return res.status(500);
        } else {
          // Return a mock object for subsequent calls
          return res.status(200).body(ufcBody);
        }
      };

      const { pollAfterSuccessfulInitialization } = configModification;
      requestConfiguration = {
        ...requestConfiguration,
        pollAfterSuccessfulInitialization,
      };
      client = new EppoClient(evaluator, storage, requestConfiguration);
      client.setIsGracefulFailureMode(false);
      // no configuration loaded
      let variation = client.getNumericAssignment(subject, flagKey, 0.0);
      expect(variation).toBe(0.0);

      // By not awaiting (yet) only the first attempt should be fired off before test execution below resumes
      const fetchPromise = client.fetchFlagConfigurations();

      // Advance timers mid-init to allow retrying
      await jest.advanceTimersByTimeAsync(maxRetryDelay);

      // Await so it can finish its initialization before this test proceeds
      await fetchPromise;

      variation = client.getNumericAssignment(subject, flagKey, 0.0);
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
      mockServerResponseFunc = (res) => {
        if (++callCount === 1) {
          // Throw an error for initialization call
          return res.status(500);
        } else {
          // Return a mock object for subsequent calls
          return res.status(200).body(ufcBody);
        }
      };

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
      client = new EppoClient(evaluator, storage, requestConfiguration);
      client.setIsGracefulFailureMode(false);
      // no configuration loaded
      expect(client.getNumericAssignment(subject, flagKey, 0.0)).toBe(0.0);

      // By not awaiting (yet) only the first attempt should be fired off before test execution below resumes
      if (throwOnFailedInitialization) {
        await expect(client.fetchFlagConfigurations()).rejects.toThrow();
      } else {
        await expect(client.fetchFlagConfigurations()).resolves.toBeUndefined();
      }
      expect(callCount).toBe(1);
      // still no configuration loaded
      expect(client.getNumericAssignment(subject, flagKey, 10.0)).toBe(10.0);

      // Advance timers so a post-init poll can take place
      await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 1.5);

      // if pollAfterFailedInitialization = true, we will poll later and get a config, otherwise not
      expect(callCount).toBe(pollAfterFailedInitialization ? 2 : 1);
      expect(client.getNumericAssignment(subject, flagKey, 0.0)).toBe(
        pollAfterFailedInitialization ? pi : 0.0,
      );
    });
  });
});
