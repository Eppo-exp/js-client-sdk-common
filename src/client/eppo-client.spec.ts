/**
 * @jest-environment jsdom
 */
import axios from 'axios';
import * as td from 'testdouble';
import mock from 'xhr-mock';

import {
  IAssignmentTestCase,
  MOCK_RAC_RESPONSE_FILE,
  OBFUSCATED_MOCK_RAC_RESPONSE_FILE,
  ValueTestType,
  readAssignmentTestData,
  readMockRacResponse,
} from '../../test/testHelpers';
import { IAssignmentHooks } from '../assignment-hooks';
import { IAssignmentLogger } from '../assignment-logger';
import { IConfigurationStore } from '../configuration-store';
import { MAX_EVENT_QUEUE_SIZE } from '../constants';
import { OperatorType } from '../dto/rule-dto';
import { EppoValue } from '../eppo_value';
import ExperimentConfigurationRequestor from '../experiment-configuration-requestor';
import HttpClient from '../http-client';

import EppoClient from './eppo-client';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require('../../package.json');

class TestConfigurationStore implements IConfigurationStore {
  private store = {};

  public get<T>(key: string): T {
    const rval = this.store[key];
    return rval ? JSON.parse(rval) : null;
  }

  public setEntries<T>(entries: Record<string, T>) {
    Object.entries(entries).forEach(([key, val]) => {
      this.store[key] = JSON.stringify(val);
    });
  }
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

  const configurationRequestor = new ExperimentConfigurationRequestor(
    configurationStore,
    httpClient,
  );
  await configurationRequestor.fetchAndStoreConfigurations();
}

describe('EppoClient E2E test', () => {
  const sessionOverrideSubject = 'subject-14';
  const sessionOverrideExperiment = 'exp-100';

  const storage = new TestConfigurationStore();
  const globalClient = new EppoClient(storage);

  beforeAll(async () => {
    mock.setup();
    mock.get(/randomized_assignment\/v3\/config*/, (_req, res) => {
      const rac = readMockRacResponse(MOCK_RAC_RESPONSE_FILE);
      return res.status(200).body(JSON.stringify(rac));
    });

    await init(storage);
  });

  afterAll(() => {
    mock.teardown();
  });

  const flagKey = 'mock-experiment';

  const mockExperimentConfig = {
    name: flagKey,
    enabled: true,
    subjectShards: 10000,
    overrides: {},
    typedOverrides: {},
    rules: [
      {
        allocationKey: 'allocation1',
        conditions: [],
      },
    ],
    allocations: {
      allocation1: {
        percentExposure: 1,
        statusQuoVariationKey: null,
        shippedVariationKey: null,
        holdouts: [],
        variations: [
          {
            name: 'control',
            value: 'control',
            typedValue: 'control',
            shardRange: {
              start: 0,
              end: 3400,
            },
          },
          {
            name: 'variant-1',
            value: 'variant-1',
            typedValue: 'variant-1',
            shardRange: {
              start: 3400,
              end: 6700,
            },
          },
          {
            name: 'variant-2',
            value: 'variant-2',
            typedValue: 'variant-2',
            shardRange: {
              start: 6700,
              end: 10000,
            },
          },
        ],
      },
    },
  };

  describe('error encountered', () => {
    let client: EppoClient;
    const mockHooks = td.object<IAssignmentHooks>();

    beforeAll(() => {
      storage.setEntries({ [flagKey]: mockExperimentConfig });
      client = new EppoClient(storage);

      td.replace(EppoClient.prototype, 'getAssignmentVariation', function () {
        throw new Error('So Graceful Error');
      });
    });

    afterAll(() => {
      td.reset();
    });

    it('returns null when graceful failure if error encountered', async () => {
      client.setIsGracefulFailureMode(true);

      expect(client.getAssignment('subject-identifer', flagKey, {}, mockHooks)).toBeNull();
      expect(client.getBoolAssignment('subject-identifer', flagKey, {}, mockHooks)).toBeNull();
      expect(
        client.getJSONStringAssignment('subject-identifer', flagKey, {}, mockHooks),
      ).toBeNull();
      expect(client.getNumericAssignment('subject-identifer', flagKey, {}, mockHooks)).toBeNull();
      expect(
        client.getParsedJSONAssignment('subject-identifer', flagKey, {}, mockHooks),
      ).toBeNull();
      expect(client.getStringAssignment('subject-identifer', flagKey, {}, mockHooks)).toBeNull();
    });

    it('throws error when graceful failure is false', async () => {
      client.setIsGracefulFailureMode(false);

      expect(() => {
        client.getAssignment('subject-identifer', flagKey, {}, mockHooks);
      }).toThrow();

      expect(() => {
        client.getBoolAssignment('subject-identifer', flagKey, {}, mockHooks);
      }).toThrow();

      expect(() => {
        client.getJSONStringAssignment('subject-identifer', flagKey, {}, mockHooks);
      }).toThrow();

      expect(() => {
        client.getParsedJSONAssignment('subject-identifer', flagKey, {}, mockHooks);
      }).toThrow();

      expect(() => {
        client.getNumericAssignment('subject-identifer', flagKey, {}, mockHooks);
      }).toThrow();

      expect(() => {
        client.getStringAssignment('subject-identifer', flagKey, {}, mockHooks);
      }).toThrow();
    });
  });

  describe('setLogger', () => {
    beforeAll(() => {
      storage.setEntries({ [flagKey]: mockExperimentConfig });
    });

    it('Invokes logger for queued events', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const client = new EppoClient(storage);
      client.getAssignment('subject-to-be-logged', flagKey);
      client.setLogger(mockLogger);

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].subject).toEqual(
        'subject-to-be-logged',
      );
    });

    it('Does not log same queued event twice', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const client = new EppoClient(storage);

      client.getAssignment('subject-to-be-logged', flagKey);
      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);

      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    });

    it('Does not invoke logger for events that exceed queue size', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const client = new EppoClient(storage);
      for (let i = 0; i < MAX_EVENT_QUEUE_SIZE + 100; i++) {
        client.getAssignment(`subject-to-be-logged-${i}`, flagKey);
      }
      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(MAX_EVENT_QUEUE_SIZE);
    });
  });

  describe('getAssignment', () => {
    it.each(readAssignmentTestData())(
      'test variation assignment splits',
      async ({
        experiment,
        valueType = ValueTestType.StringType,
        subjects,
        subjectsWithAttributes,
        expectedAssignments,
      }: IAssignmentTestCase) => {
        `---- Test Case for ${experiment} Experiment ----`;

        const assignments = getAssignmentsWithSubjectAttributes(
          subjectsWithAttributes
            ? subjectsWithAttributes
            : subjects.map((subject) => ({ subjectKey: subject })),
          experiment,
          valueType,
        );

        switch (valueType) {
          case ValueTestType.BoolType: {
            const boolAssignments = assignments.map((a) => a?.boolValue ?? null);
            expect(boolAssignments).toEqual(expectedAssignments);
            break;
          }
          case ValueTestType.NumericType: {
            const numericAssignments = assignments.map((a) => a?.numericValue ?? null);
            expect(numericAssignments).toEqual(expectedAssignments);
            break;
          }
          case ValueTestType.StringType: {
            const stringAssignments = assignments.map((a) => a?.stringValue ?? null);
            expect(stringAssignments).toEqual(expectedAssignments);
            break;
          }
          case ValueTestType.JSONType: {
            const jsonStringAssignments = assignments.map((a) => a?.stringValue ?? null);
            expect(jsonStringAssignments).toEqual(expectedAssignments);
            break;
          }
        }
      },
    );
  });

  it('returns null if getAssignment was called for the subject before any RAC was loaded', () => {
    expect(globalClient.getAssignment(sessionOverrideSubject, sessionOverrideExperiment)).toEqual(
      null,
    );
  });

  it('returns subject from overrides when enabled is true', () => {
    const entry = {
      ...mockExperimentConfig,
      enabled: false,
      overrides: {
        '1b50f33aef8f681a13f623963da967ed': 'override',
      },
      typedOverrides: {
        '1b50f33aef8f681a13f623963da967ed': 'override',
      },
    };

    storage.setEntries({ [flagKey]: entry });

    const client = new EppoClient(storage);
    const mockLogger = td.object<IAssignmentLogger>();
    client.setLogger(mockLogger);

    const assignment = client.getAssignment('subject-10', flagKey);
    expect(assignment).toEqual('override');
    expect(td.explain(mockLogger.logAssignment).callCount).toEqual(0);
  });

  it('returns subject from overrides when enabled is false', () => {
    const entry = {
      ...mockExperimentConfig,
      enabled: false,
      overrides: {
        '1b50f33aef8f681a13f623963da967ed': 'override',
      },
      typedOverrides: {
        '1b50f33aef8f681a13f623963da967ed': 'override',
      },
    };

    storage.setEntries({ [flagKey]: entry });

    const client = new EppoClient(storage);
    const mockLogger = td.object<IAssignmentLogger>();
    client.setLogger(mockLogger);
    const assignment = client.getAssignment('subject-10', flagKey);
    expect(assignment).toEqual('override');
    expect(td.explain(mockLogger.logAssignment).callCount).toEqual(0);
  });

  it('logs variation assignment and experiment key', () => {
    const mockLogger = td.object<IAssignmentLogger>();

    storage.setEntries({ [flagKey]: mockExperimentConfig });
    const client = new EppoClient(storage);
    client.setLogger(mockLogger);

    const subjectAttributes = { foo: 3 };
    const assignment = client.getAssignment('subject-10', flagKey, subjectAttributes);

    expect(assignment).toEqual('control');
    expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    expect(td.explain(mockLogger.logAssignment).calls[0].args[0].subject).toEqual('subject-10');
    expect(td.explain(mockLogger.logAssignment).calls[0].args[0].featureFlag).toEqual(flagKey);
    expect(td.explain(mockLogger.logAssignment).calls[0].args[0].experiment).toEqual(
      `${flagKey}-${mockExperimentConfig.rules[0].allocationKey}`,
    );
    expect(td.explain(mockLogger.logAssignment).calls[0].args[0].allocation).toEqual(
      `${mockExperimentConfig.rules[0].allocationKey}`,
    );
  });

  it('handles logging exception', () => {
    const mockLogger = td.object<IAssignmentLogger>();
    td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(new Error('logging error'));

    storage.setEntries({ [flagKey]: mockExperimentConfig });
    const client = new EppoClient(storage);
    client.setLogger(mockLogger);

    const subjectAttributes = { foo: 3 };
    const assignment = client.getAssignment('subject-10', flagKey, subjectAttributes);

    expect(assignment).toEqual('control');
  });

  describe('assignment logging deduplication', () => {
    let client: EppoClient;
    let mockLogger: IAssignmentLogger;

    beforeEach(() => {
      mockLogger = td.object<IAssignmentLogger>();

      storage.setEntries({ [flagKey]: mockExperimentConfig });
      client = new EppoClient(storage);
      client.setLogger(mockLogger);
    });

    it('logs duplicate assignments without an assignment cache', () => {
      client.disableAssignmentCache();

      client.getAssignment('subject-10', flagKey);
      client.getAssignment('subject-10', flagKey);

      // call count should be 2 because there is no cache.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('does not log duplicate assignments', () => {
      client.useNonExpiringAssignmentCache();

      client.getAssignment('subject-10', flagKey);
      client.getAssignment('subject-10', flagKey);

      // call count should be 1 because the second call is a cache hit and not logged.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    });

    it('logs assignment again after the lru cache is full', () => {
      client.useLRUAssignmentCache(2);

      client.getAssignment('subject-10', flagKey); // logged
      client.getAssignment('subject-10', flagKey); // cached

      client.getAssignment('subject-11', flagKey); // logged
      client.getAssignment('subject-11', flagKey); // cached

      client.getAssignment('subject-12', flagKey); // cache evicted subject-10, logged
      client.getAssignment('subject-10', flagKey); // previously evicted, logged
      client.getAssignment('subject-12', flagKey); // cached

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(4);
    });

    it('does not cache assignments if the logger had an exception', () => {
      td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(
        new Error('logging error'),
      );

      const client = new EppoClient(storage);
      client.setLogger(mockLogger);

      client.getAssignment('subject-10', flagKey);
      client.getAssignment('subject-10', flagKey);

      // call count should be 2 because the first call had an exception
      // therefore we are not sure the logger was successful and try again.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('logs for each unique flag', () => {
      storage.setEntries({
        [flagKey]: mockExperimentConfig,
        'flag-2': {
          ...mockExperimentConfig,
          name: 'flag-2',
        },
        'flag-3': {
          ...mockExperimentConfig,
          name: 'flag-3',
        },
      });

      client.useNonExpiringAssignmentCache();

      client.getAssignment('subject-10', flagKey);
      client.getAssignment('subject-10', flagKey);
      client.getAssignment('subject-10', 'flag-2');
      client.getAssignment('subject-10', 'flag-2');
      client.getAssignment('subject-10', 'flag-3');
      client.getAssignment('subject-10', 'flag-3');
      client.getAssignment('subject-10', flagKey);
      client.getAssignment('subject-10', 'flag-2');
      client.getAssignment('subject-10', 'flag-3');

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(3);
    });

    it('logs twice for the same flag when rollout increases/flag changes', () => {
      client.useNonExpiringAssignmentCache();

      storage.setEntries({
        [flagKey]: {
          ...mockExperimentConfig,
          allocations: {
            allocation1: {
              percentExposure: 1,
              statusQuoVariationKey: null,
              shippedVariationKey: null,
              holdouts: [],
              variations: [
                {
                  name: 'control',
                  value: 'control',
                  typedValue: 'control',
                  shardRange: {
                    start: 0,
                    end: 10000,
                  },
                },
                {
                  name: 'treatment',
                  value: 'treatment',
                  typedValue: 'treatment',
                  shardRange: {
                    start: 0,
                    end: 0,
                  },
                },
              ],
            },
          },
        },
      });
      client.getAssignment('subject-10', flagKey);

      storage.setEntries({
        [flagKey]: {
          ...mockExperimentConfig,
          allocations: {
            allocation1: {
              percentExposure: 1,
              statusQuoVariationKey: null,
              shippedVariationKey: null,
              holdouts: [],
              variations: [
                {
                  name: 'control',
                  value: 'control',
                  typedValue: 'control',
                  shardRange: {
                    start: 0,
                    end: 0,
                  },
                },
                {
                  name: 'treatment',
                  value: 'treatment',
                  typedValue: 'treatment',
                  shardRange: {
                    start: 0,
                    end: 10000,
                  },
                },
              ],
            },
          },
        },
      });
      client.getAssignment('subject-10', flagKey);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('logs the same subject/flag/variation after two changes', () => {
      client.useNonExpiringAssignmentCache();

      // original configuration version
      storage.setEntries({ [flagKey]: mockExperimentConfig });

      client.getAssignment('subject-10', flagKey); // log this assignment
      client.getAssignment('subject-10', flagKey); // cache hit, don't log

      // change the flag
      storage.setEntries({
        [flagKey]: {
          ...mockExperimentConfig,
          allocations: {
            allocation1: {
              percentExposure: 1,
              statusQuoVariationKey: null,
              shippedVariationKey: null,
              holdouts: [],
              variations: [
                {
                  name: 'some-new-treatment',
                  value: 'some-new-treatment',
                  typedValue: 'some-new-treatment',
                  shardRange: {
                    start: 0,
                    end: 10000,
                  },
                },
              ],
            },
          },
        },
      });

      client.getAssignment('subject-10', flagKey); // log this assignment
      client.getAssignment('subject-10', flagKey); // cache hit, don't log

      // change the flag again, back to the original
      storage.setEntries({ [flagKey]: mockExperimentConfig });

      client.getAssignment('subject-10', flagKey); // important: log this assignment
      client.getAssignment('subject-10', flagKey); // cache hit, don't log

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(3);
    });
  });

  it('only returns variation if subject matches rules', () => {
    const entry = {
      ...mockExperimentConfig,
      rules: [
        {
          allocationKey: 'allocation1',
          conditions: [
            {
              operator: OperatorType.GT,
              attribute: 'appVersion',
              value: 10,
            },
          ],
        },
      ],
    };

    storage.setEntries({ [flagKey]: entry });

    const client = new EppoClient(storage);
    let assignment = client.getAssignment('subject-10', flagKey, { appVersion: 9 });
    expect(assignment).toBeNull();
    assignment = client.getAssignment('subject-10', flagKey);
    expect(assignment).toBeNull();
    assignment = client.getAssignment('subject-10', flagKey, { appVersion: 11 });
    expect(assignment).toEqual('control');
  });

  it('returns control variation and logs holdout key if subject is in holdout in an experiment allocation', () => {
    const entry = {
      ...mockExperimentConfig,
      allocations: {
        allocation1: {
          percentExposure: 1,
          statusQuoVariationKey: 'variation-7',
          shippedVariationKey: null,
          holdouts: [
            {
              holdoutKey: 'holdout-2',
              statusQuoShardRange: {
                start: 0,
                end: 200,
              },
              shippedShardRange: null, // this is an experiment allocation because shippedShardRange is null
            },
            {
              holdoutKey: 'holdout-3',
              statusQuoShardRange: {
                start: 200,
                end: 400,
              },
              shippedShardRange: null,
            },
          ],
          variations: [
            {
              name: 'control',
              value: 'control',
              typedValue: 'control',
              shardRange: {
                start: 0,
                end: 3333,
              },
              variationKey: 'variation-7',
            },
            {
              name: 'variant-1',
              value: 'variant-1',
              typedValue: 'variant-1',
              shardRange: {
                start: 3333,
                end: 6667,
              },
              variationKey: 'variation-8',
            },
            {
              name: 'variant-2',
              value: 'variant-2',
              typedValue: 'variant-2',
              shardRange: {
                start: 6667,
                end: 10000,
              },
              variationKey: 'variation-9',
            },
          ],
        },
      },
    };

    storage.setEntries({ [flagKey]: entry });

    const mockLogger = td.object<IAssignmentLogger>();
    const client = new EppoClient(storage);
    client.setLogger(mockLogger);
    td.reset();

    // subject-79 --> holdout shard is 186
    let assignment = client.getAssignment('subject-79', flagKey);
    expect(assignment).toEqual('control');
    expect(td.explain(mockLogger.logAssignment).calls[0].args[0].holdoutVariation).toBeNull();
    expect(td.explain(mockLogger.logAssignment).calls[0].args[0].holdout).toEqual('holdout-2');

    // subject-8 --> holdout shard is 201
    assignment = client.getAssignment('subject-8', flagKey);
    expect(assignment).toEqual('control');
    // Do not log holdout variation if this is an experiment allocation
    expect(td.explain(mockLogger.logAssignment).calls[1].args[0].holdoutVariation).toBeNull();
    expect(td.explain(mockLogger.logAssignment).calls[1].args[0].holdout).toEqual('holdout-3');

    // subject-11 --> holdout shard is 9137 (outside holdout), non-holdout assignment shard is 8414
    assignment = client.getAssignment('subject-11', flagKey);
    expect(assignment).toEqual('variant-2');
    expect(td.explain(mockLogger.logAssignment).calls[2].args[0].holdoutVariation).toBeNull();
    expect(td.explain(mockLogger.logAssignment).calls[2].args[0].holdout).toBeNull();
  });

  it('returns the shipped variation and logs holdout key and variation if subject is in holdout in a rollout allocation', () => {
    const entry = {
      ...mockExperimentConfig,
      allocations: {
        allocation1: {
          percentExposure: 1,
          statusQuoVariationKey: 'variation-7',
          shippedVariationKey: 'variation-8',
          holdouts: [
            {
              holdoutKey: 'holdout-2',
              statusQuoShardRange: {
                start: 0,
                end: 100,
              },
              shippedShardRange: {
                start: 100,
                end: 200,
              },
            },
            {
              holdoutKey: 'holdout-3',
              statusQuoShardRange: {
                start: 200,
                end: 300,
              },
              shippedShardRange: {
                start: 300,
                end: 400,
              },
            },
          ],
          variations: [
            {
              name: 'control',
              value: 'control',
              typedValue: 'control',
              shardRange: {
                start: 0,
                end: 3333,
              },
              variationKey: 'variation-7',
            },
            {
              name: 'variant-1',
              value: 'variant-1',
              typedValue: 'variant-1',
              shardRange: {
                start: 3333,
                end: 6667,
              },
              variationKey: 'variation-8',
            },
            {
              name: 'variant-2',
              value: 'variant-2',
              typedValue: 'variant-2',
              shardRange: {
                start: 6667,
                end: 10000,
              },
              variationKey: 'variation-9',
            },
          ],
        },
      },
    };

    storage.setEntries({ [flagKey]: entry });

    const mockLogger = td.object<IAssignmentLogger>();
    const client = new EppoClient(storage);
    client.setLogger(mockLogger);
    td.reset();

    // subject-227 --> holdout shard is 57
    let assignment = client.getAssignment('subject-227', flagKey);
    expect(assignment).toEqual('control');
    expect(td.explain(mockLogger.logAssignment).calls[0].args[0].holdoutVariation).toEqual(
      'status_quo',
    );
    expect(td.explain(mockLogger.logAssignment).calls[0].args[0].holdout).toEqual('holdout-2');

    // subject-79 --> holdout shard is 186
    assignment = client.getAssignment('subject-79', flagKey);
    expect(assignment).toEqual('variant-1');
    expect(td.explain(mockLogger.logAssignment).calls[1].args[0].holdoutVariation).toEqual(
      'all_shipped_variants',
    );
    expect(td.explain(mockLogger.logAssignment).calls[1].args[0].holdout).toEqual('holdout-2');

    // subject-8 --> holdout shard is 201
    assignment = client.getAssignment('subject-8', flagKey);
    expect(assignment).toEqual('control');
    expect(td.explain(mockLogger.logAssignment).calls[2].args[0].holdoutVariation).toEqual(
      'status_quo',
    );
    expect(td.explain(mockLogger.logAssignment).calls[2].args[0].holdout).toEqual('holdout-3');

    // subject-50 --> holdout shard is 347
    assignment = client.getAssignment('subject-50', flagKey);
    expect(assignment).toEqual('variant-1');
    expect(td.explain(mockLogger.logAssignment).calls[3].args[0].holdoutVariation).toEqual(
      'all_shipped_variants',
    );
    expect(td.explain(mockLogger.logAssignment).calls[3].args[0].holdout).toEqual('holdout-3');

    // subject-7 --> holdout shard is 9483 (outside holdout), non-holdout assignment shard is 8673
    assignment = client.getAssignment('subject-7', flagKey);
    expect(assignment).toEqual('variant-2');
    expect(td.explain(mockLogger.logAssignment).calls[4].args[0].holdoutVariation).toBeNull();
    expect(td.explain(mockLogger.logAssignment).calls[4].args[0].holdout).toBeNull();
  });

  function getAssignmentsWithSubjectAttributes(
    subjectsWithAttributes: {
      subjectKey: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subjectAttributes?: Record<string, any>;
    }[],
    experiment: string,
    valueTestType: ValueTestType = ValueTestType.StringType,
    obfuscated = false,
  ): (EppoValue | null)[] {
    return subjectsWithAttributes.map((subject) => {
      switch (valueTestType) {
        case ValueTestType.BoolType: {
          const ba = globalClient.getBoolAssignment(
            subject.subjectKey,
            experiment,
            subject.subjectAttributes,
            undefined,
            obfuscated,
          );
          if (ba === null) return null;
          return EppoValue.Bool(ba);
        }
        case ValueTestType.NumericType: {
          const na = globalClient.getNumericAssignment(
            subject.subjectKey,
            experiment,
            subject.subjectAttributes,
          );
          if (na === null) return null;
          return EppoValue.Numeric(na);
        }
        case ValueTestType.StringType: {
          const sa = globalClient.getStringAssignment(
            subject.subjectKey,
            experiment,
            subject.subjectAttributes,
          );
          if (sa === null) return null;
          return EppoValue.String(sa);
        }
        case ValueTestType.JSONType: {
          const sa = globalClient.getJSONStringAssignment(
            subject.subjectKey,
            experiment,
            subject.subjectAttributes,
          );
          const oa = globalClient.getParsedJSONAssignment(
            subject.subjectKey,
            experiment,
            subject.subjectAttributes,
          );
          if (oa == null || sa === null) return null;
          return EppoValue.JSON(sa, oa);
        }
      }
    });
  }

  describe('getAssignment with hooks', () => {
    let client: EppoClient;

    beforeAll(() => {
      storage.setEntries({ [flagKey]: mockExperimentConfig });
      client = new EppoClient(storage);
    });

    describe('onPreAssignment', () => {
      it('called with experiment key and subject id', () => {
        const mockHooks = td.object<IAssignmentHooks>();
        client.getAssignment('subject-identifer', flagKey, {}, mockHooks);
        expect(td.explain(mockHooks.onPreAssignment).callCount).toEqual(1);
        expect(td.explain(mockHooks.onPreAssignment).calls[0].args[0]).toEqual(flagKey);
        expect(td.explain(mockHooks.onPreAssignment).calls[0].args[1]).toEqual('subject-identifer');
      });

      it('overrides returned assignment', async () => {
        const mockLogger = td.object<IAssignmentLogger>();
        client.setLogger(mockLogger);
        td.reset();
        const variation = await client.getAssignment(
          'subject-identifer',
          flagKey,
          {},
          {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onPreAssignment(experimentKey: string, subject: string): EppoValue | null {
              return EppoValue.String('my-overridden-variation');
            },

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onPostAssignment(
              experimentKey: string, // eslint-disable-line @typescript-eslint/no-unused-vars
              subject: string, // eslint-disable-line @typescript-eslint/no-unused-vars
              variation: EppoValue | null, // eslint-disable-line @typescript-eslint/no-unused-vars
            ): void {
              // no-op
            },
          },
        );

        expect(variation).toEqual('my-overridden-variation');
        expect(td.explain(mockLogger.logAssignment).callCount).toEqual(0);
      });

      it('uses regular assignment logic if onPreAssignment returns null', async () => {
        const mockLogger = td.object<IAssignmentLogger>();
        client.setLogger(mockLogger);
        td.reset();
        const variation = await client.getAssignment(
          'subject-identifer',
          flagKey,
          {},
          {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            onPreAssignment(experimentKey: string, subject: string): EppoValue | null {
              return null;
            },

            onPostAssignment(
              experimentKey: string, // eslint-disable-line @typescript-eslint/no-unused-vars
              subject: string, // eslint-disable-line @typescript-eslint/no-unused-vars
              variation: EppoValue | null, // eslint-disable-line @typescript-eslint/no-unused-vars
            ): void {
              // no-op
            },
          },
        );

        expect(variation).not.toBeNull();
        expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      });
    });

    describe('onPostAssignment', () => {
      it('called with assigned variation after assignment', async () => {
        const mockHooks = td.object<IAssignmentHooks>();
        const subject = 'subject-identifier';
        const variation = client.getAssignment(subject, flagKey, {}, mockHooks);
        expect(td.explain(mockHooks.onPostAssignment).callCount).toEqual(1);
        expect(td.explain(mockHooks.onPostAssignment).callCount).toEqual(1);
        expect(td.explain(mockHooks.onPostAssignment).calls[0].args[0]).toEqual(flagKey);
        expect(td.explain(mockHooks.onPostAssignment).calls[0].args[1]).toEqual(subject);
        expect(td.explain(mockHooks.onPostAssignment).calls[0].args[2]).toEqual(
          EppoValue.String(variation ?? ''),
        );
      });
    });
  });
});

describe(' EppoClient getAssignment From Obfuscated RAC', () => {
  const storage = new TestConfigurationStore();
  const globalClient = new EppoClient(storage);

  beforeAll(async () => {
    mock.setup();
    mock.get(/randomized_assignment\/v3\/config*/, (_req, res) => {
      const rac = readMockRacResponse(OBFUSCATED_MOCK_RAC_RESPONSE_FILE);
      return res.status(200).body(JSON.stringify(rac));
    });
    await init(storage);
  });

  afterAll(() => {
    mock.teardown();
  });

  it.each(readAssignmentTestData())(
    'test variation assignment splits',
    async ({
      experiment,
      valueType = ValueTestType.StringType,
      subjects,
      subjectsWithAttributes,
      expectedAssignments,
    }: IAssignmentTestCase) => {
      `---- Test Case for ${experiment} Experiment ----`;

      const assignments = getAssignmentsWithSubjectAttributes(
        subjectsWithAttributes
          ? subjectsWithAttributes
          : subjects.map((subject) => ({ subjectKey: subject })),
        experiment,
        valueType,
      );

      switch (valueType) {
        case ValueTestType.BoolType: {
          const boolAssignments = assignments.map((a) => a?.boolValue ?? null);
          expect(boolAssignments).toEqual(expectedAssignments);
          break;
        }
        case ValueTestType.NumericType: {
          const numericAssignments = assignments.map((a) => a?.numericValue ?? null);
          expect(numericAssignments).toEqual(expectedAssignments);
          break;
        }
        case ValueTestType.StringType: {
          const stringAssignments = assignments.map((a) => a?.stringValue ?? null);
          expect(stringAssignments).toEqual(expectedAssignments);
          break;
        }
        case ValueTestType.JSONType: {
          const jsonStringAssignments = assignments.map((a) => a?.stringValue ?? null);
          expect(jsonStringAssignments).toEqual(expectedAssignments);
          break;
        }
      }
    },
  );

  function getAssignmentsWithSubjectAttributes(
    subjectsWithAttributes: {
      subjectKey: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subjectAttributes?: Record<string, any>;
    }[],
    experiment: string,
    valueTestType: ValueTestType = ValueTestType.StringType,
  ): (EppoValue | null)[] {
    return subjectsWithAttributes.map((subject) => {
      switch (valueTestType) {
        case ValueTestType.BoolType: {
          const ba = globalClient.getBoolAssignment(
            subject.subjectKey,
            experiment,
            subject.subjectAttributes,
            undefined,
            true,
          );
          if (ba === null) return null;
          return EppoValue.Bool(ba);
        }
        case ValueTestType.NumericType: {
          const na = globalClient.getNumericAssignment(
            subject.subjectKey,
            experiment,
            subject.subjectAttributes,
            undefined,
            true,
          );
          if (na === null) return null;
          return EppoValue.Numeric(na);
        }
        case ValueTestType.StringType: {
          const sa = globalClient.getStringAssignment(
            subject.subjectKey,
            experiment,
            subject.subjectAttributes,
            undefined,
            true,
          );
          if (sa === null) return null;
          return EppoValue.String(sa);
        }
        case ValueTestType.JSONType: {
          const sa = globalClient.getJSONStringAssignment(
            subject.subjectKey,
            experiment,
            subject.subjectAttributes,
            undefined,
            true,
          );
          const oa = globalClient.getParsedJSONAssignment(
            subject.subjectKey,
            experiment,
            subject.subjectAttributes,
            undefined,
            true,
          );
          if (oa == null || sa === null) return null;
          return EppoValue.JSON(sa, oa);
        }
      }
    });
  }
});
