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
  ValueTestType,
  readAssignmentTestData,
  readMockUFCResponse,
} from '../../test/testHelpers';
import { IAssignmentHooks } from '../assignment-hooks';
import { IAssignmentLogger } from '../assignment-logger';
import { IConfigurationStore } from '../configuration-store';
import { MAX_EVENT_QUEUE_SIZE, POLL_INTERVAL_MS, POLL_JITTER_PCT } from '../constants';
import { OperatorType } from '../dto/rule-dto';
import { EppoValue } from '../eppo_value';
import { Evaluator } from '../eval';
import ExperimentConfigurationRequestor from '../experiment-configuration-requestor';
import HttpClient from '../http-client';
import { Flag, VariationType } from '../interfaces';
import { MD5Sharder } from '../sharders';
import { AttributeType, SubjectAttributes } from '../types';

import EppoClient, { FlagConfigurationRequestParameters } from './eppo-client';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require('../../package.json');

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
): { subject: SubjectTestCase; assignment: string | boolean | number | null | object }[] {
  const assignments: {
    subject: SubjectTestCase;
    assignment: string | boolean | number | null | object;
  }[] = [];
  for (const subject of testCase.subjects) {
    const assignment = assignmentFn(
      subject.subjectKey,
      testCase.flag,
      subject.subjectAttributes,
      null,
      undefined,
      false,
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

  const configurationRequestor = new ExperimentConfigurationRequestor(
    configurationStore,
    httpClient,
  );
  await configurationRequestor.fetchAndStoreConfigurations();
}

describe('EppoClient E2E test', () => {
  const evaluator = new Evaluator(new MD5Sharder());
  const storage = new TestConfigurationStore();
  const globalClient = new EppoClient(evaluator, storage);

  beforeAll(async () => {
    mock.setup();
    mock.get(/flag_config\/v1\/config*/, (_req, res) => {
      const rac = readMockUFCResponse(MOCK_UFC_RESPONSE_FILE);
      return res.status(200).body(JSON.stringify(rac));
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
      const evaluator = new Evaluator(new MD5Sharder());
      client = new EppoClient(evaluator, storage);

      td.replace(EppoClient.prototype, 'getAssignmentDetail', function () {
        throw new Error('Mock test error');
      });
    });

    afterAll(() => {
      td.reset();
    });

    it('returns null when graceful failure if error encountered', async () => {
      client.setIsGracefulFailureMode(true);

      expect(client.getBoolAssignment('subject-identifer', flagKey, {})).toBeNull();
      expect(client.getNumericAssignment('subject-identifer', flagKey, {})).toBeNull();
      expect(client.getJSONAssignment('subject-identifer', flagKey, {})).toBeNull();
      expect(client.getStringAssignment('subject-identifer', flagKey, {})).toBeNull();
    });

    it('returns default value when graceful failure if error encounterd', async () => {
      client.setIsGracefulFailureMode(true);

      expect(client.getBoolAssignment('subject-identifer', flagKey, {}, true)).toBe(true);
      expect(client.getNumericAssignment('subject-identifer', flagKey, {}, 1)).toBe(1);
      expect(client.getJSONAssignment('subject-identifer', flagKey, {}, {})).toEqual({});
      expect(client.getStringAssignment('subject-identifer', flagKey, {}, 'default')).toBe(
        'default',
      );
    });

    it('throws error when graceful failure is false', async () => {
      client.setIsGracefulFailureMode(false);

      expect(() => {
        client.getBoolAssignment('subject-identifer', flagKey, {});
      }).toThrow();

      expect(() => {
        client.getJSONAssignment('subject-identifer', flagKey, {});
      }).toThrow();

      expect(() => {
        client.getNumericAssignment('subject-identifer', flagKey, {});
      }).toThrow();

      expect(() => {
        client.getStringAssignment('subject-identifer', flagKey, {});
      }).toThrow();
    });
  });

  describe('setLogger', () => {
    beforeAll(() => {
      storage.setEntries({ [flagKey]: mockFlag });
    });

    it('Invokes logger for queued events', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const evaluator = new Evaluator(new MD5Sharder());
      const client = new EppoClient(evaluator, storage);
      client.getStringAssignment('subject-to-be-logged', flagKey);
      client.setLogger(mockLogger);

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].subject).toEqual(
        'subject-to-be-logged',
      );
    });

    it('Does not log same queued event twice', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const evaluator = new Evaluator(new MD5Sharder());
      const client = new EppoClient(evaluator, storage);

      client.getStringAssignment('subject-to-be-logged', flagKey);
      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);

      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    });

    it('Does not invoke logger for events that exceed queue size', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const evaluator = new Evaluator(new MD5Sharder());
      const client = new EppoClient(evaluator, storage);

      for (let i = 0; i < MAX_EVENT_QUEUE_SIZE + 100; i++) {
        client.getStringAssignment(`subject-to-be-logged-${i}`, flagKey);
      }
      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(MAX_EVENT_QUEUE_SIZE);
    });
  });

  describe('UFC General Test Cases', () => {
    it.each(readAssignmentTestData())(
      'test variation assignment splits',
      async ({ flag, variationType, subjects }: IAssignmentTestCase) => {
        `---- Test Case for ${flag} Experiment ----`;

        const evaluator = new Evaluator(new MD5Sharder());
        const client = new EppoClient(evaluator, storage);

        let assignments: {
          subject: SubjectTestCase;
          assignment: string | boolean | number | null | object;
        }[] = [];
        switch (variationType) {
          case VariationType.BOOLEAN: {
            assignments = getTestAssignments(
              { flag, variationType, subjects },
              client.getBoolAssignment,
            );
            break;
          }
          case VariationType.NUMERIC: {
            assignments = getTestAssignments(
              { flag, variationType, subjects },
              client.getNumericAssignment,
            );
            break;
          }
          case VariationType.INTEGER: {
            assignments = getTestAssignments(
              { flag, variationType, subjects },
              client.getIntegerAssignment,
            );
            break;
          }
          case VariationType.STRING: {
            assignments = getTestAssignments(
              { flag, variationType, subjects },
              client.getStringAssignment,
            );
            break;
          }
          case VariationType.JSON: {
            assignments = getTestAssignments(
              { flag, variationType, subjects },
              client.getStringAssignment,
            );
            break;
          }
          default: {
            throw new Error(`Unknown variation type: ${variationType}`);
          }
        }
        console.log(assignments);
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
    const evaluator = new Evaluator(new MD5Sharder());
    const client = new EppoClient(evaluator, storage);

    const nonExistantFlag = 'non-existent-flag';

    expect(client.getBoolAssignment('subject-identifer', nonExistantFlag, {}, true)).toBe(true);
    expect(client.getNumericAssignment('subject-identifer', nonExistantFlag, {}, 1)).toBe(1);
    expect(client.getJSONAssignment('subject-identifer', nonExistantFlag, {}, {})).toEqual({});
    expect(client.getStringAssignment('subject-identifer', nonExistantFlag, {}, 'default')).toBe(
      'default',
    );
  });

  it('logs variation assignment and experiment key', () => {
    const mockLogger = td.object<IAssignmentLogger>();

    storage.setEntries({ [flagKey]: mockFlag });
    const evaluator = new Evaluator(new MD5Sharder());
    const client = new EppoClient(evaluator, storage);
    client.setLogger(mockLogger);

    const subjectAttributes = { foo: 3 };
    const assignment = client.getStringAssignment('subject-10', flagKey, subjectAttributes);

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
    const evaluator = new Evaluator(new MD5Sharder());
    const client = new EppoClient(evaluator, storage);
    client.setLogger(mockLogger);

    const subjectAttributes = { foo: 3 };
    const assignment = client.getStringAssignment('subject-10', flagKey, subjectAttributes);

    expect(assignment).toEqual('variation-a');
  });

  describe('assignment logging deduplication', () => {
    let client: EppoClient;
    let evaluator: Evaluator;
    let mockLogger: IAssignmentLogger;

    beforeEach(() => {
      mockLogger = td.object<IAssignmentLogger>();

      storage.setEntries({ [flagKey]: mockFlag });
      evaluator = new Evaluator(new MD5Sharder());
      client = new EppoClient(evaluator, storage);
      client.setLogger(mockLogger);
    });

    it('logs duplicate assignments without an assignment cache', () => {
      client.disableAssignmentCache();

      client.getStringAssignment('subject-10', flagKey);
      client.getStringAssignment('subject-10', flagKey);

      // call count should be 2 because there is no cache.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('does not log duplicate assignments', () => {
      client.useNonExpiringInMemoryAssignmentCache();

      client.getStringAssignment('subject-10', flagKey);
      client.getStringAssignment('subject-10', flagKey);

      // call count should be 1 because the second call is a cache hit and not logged.
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    });

    it('logs assignment again after the lru cache is full', () => {
      client.useLRUInMemoryAssignmentCache(2);

      client.getStringAssignment('subject-10', flagKey); // logged
      client.getStringAssignment('subject-10', flagKey); // cached

      client.getStringAssignment('subject-11', flagKey); // logged
      client.getStringAssignment('subject-11', flagKey); // cached

      client.getStringAssignment('subject-12', flagKey); // cache evicted subject-10, logged
      client.getStringAssignment('subject-10', flagKey); // previously evicted, logged
      client.getStringAssignment('subject-12', flagKey); // cached

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(4);
    });

    it('does not cache assignments if the logger had an exception', () => {
      td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(
        new Error('logging error'),
      );

      client.setLogger(mockLogger);

      client.getStringAssignment('subject-10', flagKey);
      client.getStringAssignment('subject-10', flagKey);

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

      client.getStringAssignment('subject-10', flagKey);
      client.getStringAssignment('subject-10', flagKey);
      client.getStringAssignment('subject-10', 'flag-2');
      client.getStringAssignment('subject-10', 'flag-2');
      client.getStringAssignment('subject-10', 'flag-3');
      client.getStringAssignment('subject-10', 'flag-3');
      client.getStringAssignment('subject-10', flagKey);
      client.getStringAssignment('subject-10', 'flag-2');
      client.getStringAssignment('subject-10', 'flag-3');

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
      client.getStringAssignment('subject-10', flagKey);

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
      client.getStringAssignment('subject-10', flagKey);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(2);
    });

    it('logs the same subject/flag/variation after two changes', () => {
      client.useNonExpiringInMemoryAssignmentCache();

      // original configuration version
      storage.setEntries({ [flagKey]: mockFlag });

      client.getStringAssignment('subject-10', flagKey); // log this assignment
      client.getStringAssignment('subject-10', flagKey); // cache hit, don't log

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

      client.getStringAssignment('subject-10', flagKey); // log this assignment
      client.getStringAssignment('subject-10', flagKey); // cache hit, don't log

      // change the flag again, back to the original
      storage.setEntries({ [flagKey]: mockFlag });

      client.getStringAssignment('subject-10', flagKey); // important: log this assignment
      client.getStringAssignment('subject-10', flagKey); // cache hit, don't log

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

      client.getStringAssignment('subject-10', flagKey); // log this assignment
      client.getStringAssignment('subject-10', flagKey); // cache hit, don't log

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(4);
    });
  });

  //   describe('getStringAssignment with hooks', () => {
  //     let client: EppoClient;

  //     beforeAll(() => {
  //       storage.setEntries({ [flagKey]: mockExperimentConfig });
  //       client = new EppoClient(storage);
  //     });

  //     describe('onPreAssignment', () => {
  //       it('called with experiment key and subject id', () => {
  //         const mockHooks = td.object<IAssignmentHooks>();
  //         client.getStringAssignment('subject-identifer', flagKey, {}, mockHooks);
  //         expect(td.explain(mockHooks.onPreAssignment).callCount).toEqual(1);
  //         expect(td.explain(mockHooks.onPreAssignment).calls[0].args[0]).toEqual(flagKey);
  //         expect(td.explain(mockHooks.onPreAssignment).calls[0].args[1]).toEqual('subject-identifer');
  //       });

  //       it('overrides returned assignment', async () => {
  //         const mockLogger = td.object<IAssignmentLogger>();
  //         client.setLogger(mockLogger);
  //         td.reset();
  //         const variation = await client.getStringAssignment(
  //           'subject-identifer',
  //           flagKey,
  //           {},
  //           {
  //             // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //             onPreAssignment(experimentKey: string, subject: string): EppoValue | null {
  //               return EppoValue.String('my-overridden-variation');
  //             },

  //             // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //             onPostAssignment(
  //               experimentKey: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  //               subject: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  //               variation: EppoValue | null, // eslint-disable-line @typescript-eslint/no-unused-vars
  //             ): void {
  //               // no-op
  //             },
  //           },
  //         );

  //         expect(variation).toEqual('my-overridden-variation');
  //         expect(td.explain(mockLogger.logAssignment).callCount).toEqual(0);
  //       });

  //       it('uses regular assignment logic if onPreAssignment returns null', async () => {
  //         const mockLogger = td.object<IAssignmentLogger>();
  //         client.setLogger(mockLogger);
  //         td.reset();
  //         const variation = await client.getStringAssignment(
  //           'subject-identifer',
  //           flagKey,
  //           {},
  //           {
  //             // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //             onPreAssignment(experimentKey: string, subject: string): EppoValue | null {
  //               return null;
  //             },

  //             onPostAssignment(
  //               experimentKey: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  //               subject: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  //               variation: EppoValue | null, // eslint-disable-line @typescript-eslint/no-unused-vars
  //             ): void {
  //               // no-op
  //             },
  //           },
  //         );

  //         expect(variation).not.toBeNull();
  //         expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
  //       });
  //     });

  //     describe('onPostAssignment', () => {
  //       it('called with assigned variation after assignment', async () => {
  //         const mockHooks = td.object<IAssignmentHooks>();
  //         const subject = 'subject-identifier';
  //         const variation = client.getStringAssignment(subject, flagKey, {}, mockHooks);
  //         expect(td.explain(mockHooks.onPostAssignment).callCount).toEqual(1);
  //         expect(td.explain(mockHooks.onPostAssignment).callCount).toEqual(1);
  //         expect(td.explain(mockHooks.onPostAssignment).calls[0].args[0]).toEqual(flagKey);
  //         expect(td.explain(mockHooks.onPostAssignment).calls[0].args[1]).toEqual(subject);
  //         expect(td.explain(mockHooks.onPostAssignment).calls[0].args[2]).toEqual(
  //           EppoValue.String(variation ?? ''),
  //         );
  //       });
  //     });
  //   });
  // });

  // describe(' EppoClient getStringAssignment From Obfuscated RAC', () => {
  //   const storage = new TestConfigurationStore();
  //   const evaluator = new Evaluator(new MD5Sharder());
  //   const globalClient = new EppoClient(evaluator, storage);

  //   beforeAll(async () => {
  //     mock.setup();
  //     mock.get(/randomized_assignment\/v3\/config*/, (_req, res) => {
  //       const rac = readMockUFCResponse(OBFUSCATED_MOCK_RAC_RESPONSE_FILE);
  //       return res.status(200).body(JSON.stringify(rac));
  //     });
  //     await init(storage);
  //   });

  //   afterAll(() => {
  //     mock.teardown();
  //   });

  //   it.each(readAssignmentTestData())(
  //     'test variation assignment splits',
  //     async ({
  //       experiment,
  //       valueType = ValueTestType.StringType,
  //       subjects,
  //       subjectsWithAttributes,
  //       expectedAssignments,
  //     }: IAssignmentTestCase) => {
  //       `---- Test Case for ${experiment} Experiment ----`;

  //       const assignments = getAssignmentsWithSubjectAttributes(
  //         subjectsWithAttributes
  //           ? subjectsWithAttributes
  //           : subjects.map((subject) => ({ subjectKey: subject })),
  //         experiment,
  //         valueType,
  //       );

  //       switch (valueType) {
  //         case ValueTestType.BoolType: {
  //           const boolAssignments = assignments.map((a) => a?.boolValue ?? null);
  //           expect(boolAssignments).toEqual(expectedAssignments);
  //           break;
  //         }
  //         case ValueTestType.NumericType: {
  //           const numericAssignments = assignments.map((a) => a?.numericValue ?? null);
  //           expect(numericAssignments).toEqual(expectedAssignments);
  //           break;
  //         }
  //         case ValueTestType.StringType: {
  //           const stringAssignments = assignments.map((a) => a?.stringValue ?? null);
  //           expect(stringAssignments).toEqual(expectedAssignments);
  //           break;
  //         }
  //         case ValueTestType.JSONType: {
  //           const jsonStringAssignments = assignments.map((a) => a?.stringValue ?? null);
  //           expect(jsonStringAssignments).toEqual(expectedAssignments);
  //           break;
  //         }
  //       }
  //     },
  //   );

  //   function getAssignmentsWithSubjectAttributes(
  //     subjectsWithAttributes: {
  //       subjectKey: string;
  //       // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //       subjectAttributes?: Record<string, any>;
  //     }[],
  //     experiment: string,
  //     valueTestType: ValueTestType = ValueTestType.StringType,
  //   ): (EppoValue | null)[] {
  //     return subjectsWithAttributes.map((subject) => {
  //       switch (valueTestType) {
  //         case ValueTestType.BoolType: {
  //           const ba = globalClient.getBoolAssignment(
  //             subject.subjectKey,
  //             experiment,
  //             subject.subjectAttributes,
  //             undefined,
  //             true,
  //           );
  //           if (ba === null) return null;
  //           return EppoValue.Bool(ba);
  //         }
  //         case ValueTestType.NumericType: {
  //           const na = globalClient.getNumericAssignment(
  //             subject.subjectKey,
  //             experiment,
  //             subject.subjectAttributes,
  //             undefined,
  //             true,
  //           );
  //           if (na === null) return null;
  //           return EppoValue.Numeric(na);
  //         }
  //         case ValueTestType.StringType: {
  //           const sa = globalClient.getStringAssignment(
  //             subject.subjectKey,
  //             experiment,
  //             subject.subjectAttributes,
  //             undefined,
  //             true,
  //           );
  //           if (sa === null) return null;
  //           return EppoValue.String(sa);
  //         }
  //         case ValueTestType.JSONType: {
  //           const sa = globalClient.getJSONStringAssignment(
  //             subject.subjectKey,
  //             experiment,
  //             subject.subjectAttributes,
  //             undefined,
  //             true,
  //           );
  //           const oa = globalClient.getParsedJSONAssignment(
  //             subject.subjectKey,
  //             experiment,
  //             subject.subjectAttributes,
  //             undefined,
  //             true,
  //           );
  //           if (oa == null || sa === null) return null;
  //           return EppoValue.JSON(sa, oa);
  //         }
  //       }
  //     });
  //   }
  // });

  // describe('Eppo Client constructed with configuration request parameters', () => {
  //   let client: EppoClient;
  //   let storage: IConfigurationStore;
  //   let requestConfiguration: ExperimentConfigurationRequestParameters;
  //   let mockServerResponseFunc: (res: MockResponse) => MockResponse;

  //   const racBody = JSON.stringify(readMockRacResponse(MOCK_RAC_RESPONSE_FILE));
  //   const flagKey = 'randomization_algo';
  //   const subjectForGreenVariation = 'subject-identiferA';

  //   const maxRetryDelay = POLL_INTERVAL_MS * POLL_JITTER_PCT;

  //   beforeAll(() => {
  //     mock.setup();
  //     mock.get(/randomized_assignment\/v3\/config*/, (_req, res) => {
  //       return mockServerResponseFunc(res);
  //     });
  //   });

  //   beforeEach(() => {
  //     storage = new TestConfigurationStore();
  //     requestConfiguration = {
  //       apiKey: 'dummy key',
  //       sdkName: 'js-client-sdk-common',
  //       sdkVersion: packageJson.version,
  //     };
  //     mockServerResponseFunc = (res) => res.status(200).body(racBody);

  //     // We only want to fake setTimeout() and clearTimeout()
  //     jest.useFakeTimers({
  //       advanceTimers: true,
  //       doNotFake: [
  //         'Date',
  //         'hrtime',
  //         'nextTick',
  //         'performance',
  //         'queueMicrotask',
  //         'requestAnimationFrame',
  //         'cancelAnimationFrame',
  //         'requestIdleCallback',
  //         'cancelIdleCallback',
  //         'setImmediate',
  //         'clearImmediate',
  //         'setInterval',
  //         'clearInterval',
  //       ],
  //     });
  //   });

  //   afterEach(() => {
  //     jest.clearAllTimers();
  //     jest.useRealTimers();
  //   });

  //   afterAll(() => {
  //     mock.teardown();
  //   });

  //   it('Fetches initial configuration with parameters in constructor', async () => {
  //     client = new EppoClient(storage, requestConfiguration);
  //     client.setIsGracefulFailureMode(false);
  //     // no configuration loaded
  //     let variation = client.getStringAssignment(subjectForGreenVariation, flagKey);
  //     expect(variation).toBeNull();
  //     // have client fetch configurations
  //     await client.fetchFlagConfigurations();
  //     variation = client.getStringAssignment(subjectForGreenVariation, flagKey);
  //     expect(variation).toBe('green');
  //   });

  //   it('Fetches initial configuration with parameters provided later', async () => {
  //     client = new EppoClient(storage);
  //     client.setIsGracefulFailureMode(false);
  //     client.setConfigurationRequestParameters(requestConfiguration);
  //     // no configuration loaded
  //     let variation = client.getStringAssignment(subjectForGreenVariation, flagKey);
  //     expect(variation).toBeNull();
  //     // have client fetch configurations
  //     await client.fetchFlagConfigurations();
  //     variation = client.getStringAssignment(subjectForGreenVariation, flagKey);
  //     expect(variation).toBe('green');
  //   });

  //   it.each([
  //     { pollAfterSuccessfulInitialization: false },
  //     { pollAfterSuccessfulInitialization: true },
  //   ])('retries initial configuration request with config %p', async (configModification) => {
  //     let callCount = 0;
  //     mockServerResponseFunc = (res) => {
  //       if (++callCount === 1) {
  //         // Throw an error for the first call
  //         return res.status(500);
  //       } else {
  //         // Return a mock object for subsequent calls
  //         return res.status(200).body(racBody);
  //       }
  //     };

  //     const { pollAfterSuccessfulInitialization } = configModification;
  //     requestConfiguration = {
  //       ...requestConfiguration,
  //       pollAfterSuccessfulInitialization,
  //     };
  //     client = new EppoClient(storage, requestConfiguration);
  //     client.setIsGracefulFailureMode(false);
  //     // no configuration loaded
  //     let variation = client.getStringAssignment(subjectForGreenVariation, flagKey);
  //     expect(variation).toBeNull();

  //     // By not awaiting (yet) only the first attempt should be fired off before test execution below resumes
  //     const fetchPromise = client.fetchFlagConfigurations();

  //     // Advance timers mid-init to allow retrying
  //     await jest.advanceTimersByTimeAsync(maxRetryDelay);

  //     // Await so it can finish its initialization before this test proceeds
  //     await fetchPromise;

  //     variation = client.getStringAssignment(subjectForGreenVariation, flagKey);
  //     expect(variation).toBe('green');
  //     expect(callCount).toBe(2);

  //     await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  //     // By default, no more polling
  //     expect(callCount).toBe(pollAfterSuccessfulInitialization ? 3 : 2);
  //   });

  //   it.each([
  //     {
  //       pollAfterFailedInitialization: false,
  //       throwOnFailedInitialization: false,
  //     },
  //     { pollAfterFailedInitialization: false, throwOnFailedInitialization: true },
  //     { pollAfterFailedInitialization: true, throwOnFailedInitialization: false },
  //     { pollAfterFailedInitialization: true, throwOnFailedInitialization: true },
  //   ])('initial configuration request fails with config %p', async (configModification) => {
  //     let callCount = 0;
  //     mockServerResponseFunc = (res) => {
  //       if (++callCount === 1) {
  //         // Throw an error for initialization call
  //         return res.status(500);
  //       } else {
  //         // Return a mock object for subsequent calls
  //         return res.status(200).body(racBody);
  //       }
  //     };

  //     const { pollAfterFailedInitialization, throwOnFailedInitialization } = configModification;

  //     // Note: fake time does not play well with errors bubbled up after setTimeout (event loop,
  //     // timeout queue, message queue stuff) so we don't allow retries when rethrowing.
  //     const numInitialRequestRetries = 0;

  //     requestConfiguration = {
  //       ...requestConfiguration,
  //       numInitialRequestRetries,
  //       throwOnFailedInitialization,
  //       pollAfterFailedInitialization,
  //     };
  //     client = new EppoClient(storage, requestConfiguration);
  //     client.setIsGracefulFailureMode(false);
  //     // no configuration loaded
  //     expect(client.getStringAssignment(subjectForGreenVariation, flagKey)).toBeNull();

  //     // By not awaiting (yet) only the first attempt should be fired off before test execution below resumes
  //     if (throwOnFailedInitialization) {
  //       await expect(client.fetchFlagConfigurations()).rejects.toThrow();
  //     } else {
  //       await expect(client.fetchFlagConfigurations()).resolves.toBeUndefined();
  //     }
  //     expect(callCount).toBe(1);
  //     // still no configuration loaded
  //     expect(client.getStringAssignment(subjectForGreenVariation, flagKey)).toBeNull();

  //     // Advance timers so a post-init poll can take place
  //     await jest.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 1.5);

  //     // if pollAfterFailedInitialization = true, we will poll later and get a config, otherwise not
  //     expect(callCount).toBe(pollAfterFailedInitialization ? 2 : 1);
  //     expect(client.getStringAssignment(subjectForGreenVariation, flagKey)).toBe(
  //       pollAfterFailedInitialization ? 'green' : null,
  //     );
  //   });
});
