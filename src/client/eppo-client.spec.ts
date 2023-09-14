/**
 * @jest-environment jsdom
 */
import axios from 'axios';
import * as md5 from 'md5';
import * as td from 'testdouble';
import mock from 'xhr-mock';

import {
  IAssignmentTestCase,
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
      const rac = readMockRacResponse();
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
    subjectShards: 100,
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
        variations: [
          {
            name: 'control',
            value: 'control',
            typedValue: 'control',
            shardRange: {
              start: 0,
              end: 34,
            },
          },
          {
            name: 'variant-1',
            value: 'variant-1',
            typedValue: 'variant-1',
            shardRange: {
              start: 34,
              end: 67,
            },
          },
          {
            name: 'variant-2',
            value: 'variant-2',
            typedValue: 'variant-2',
            shardRange: {
              start: 67,
              end: 100,
            },
          },
        ],
      },
    },
  };

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

        const assignments = subjectsWithAttributes
          ? getAssignmentsWithSubjectAttributes(subjectsWithAttributes, experiment, valueType)
          : getAssignments(subjects, experiment, valueType);

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

  it('logs variation assignment', () => {
    const mockLogger = td.object<IAssignmentLogger>();

    storage.setEntries({ [flagKey]: mockExperimentConfig });
    const client = new EppoClient(storage);
    client.setLogger(mockLogger);

    const subjectAttributes = { foo: 3 };
    const assignment = client.getAssignment('subject-10', flagKey, subjectAttributes);

    expect(assignment).toEqual('control');
    expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    expect(td.explain(mockLogger.logAssignment).calls[0].args[0].subject).toEqual('subject-10');
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
    expect(assignment).toEqual(null);
    assignment = client.getAssignment('subject-10', flagKey);
    expect(assignment).toEqual(null);
    assignment = client.getAssignment('subject-10', flagKey, { appVersion: 11 });
    expect(assignment).toEqual('control');
  });

  function getAssignments(
    subjects: string[],
    experiment: string,
    valueTestType: ValueTestType = ValueTestType.StringType,
  ): (EppoValue | null)[] {
    return subjects.map((subjectKey) => {
      switch (valueTestType) {
        case ValueTestType.BoolType: {
          const ba = globalClient.getBoolAssignment(subjectKey, experiment);
          if (ba === null) return null;
          return EppoValue.Bool(ba);
        }
        case ValueTestType.NumericType: {
          const na = globalClient.getNumericAssignment(subjectKey, experiment);
          if (na === null) return null;
          return EppoValue.Numeric(na);
        }
        case ValueTestType.StringType: {
          const sa = globalClient.getStringAssignment(subjectKey, experiment);
          if (sa === null) return null;
          return EppoValue.String(sa);
        }
        case ValueTestType.JSONType: {
          const sa = globalClient.getJSONStringAssignment(subjectKey, experiment);
          const oa = globalClient.getParsedJSONAssignment(subjectKey, experiment);
          if (oa == null || sa === null) return null;
          return EppoValue.JSON(sa, oa);
        }
      }
    });
  }

  function getAssignmentsWithSubjectAttributes(
    subjectsWithAttributes: {
      subjectKey: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subjectAttributes: Record<string, any>;
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
    beforeAll(() => {
      storage.setEntries({ [flagKey]: mockExperimentConfig });
    });

    describe('onPreAssignment', () => {
      it('called with experiment key and subject id', () => {
        const mockHooks = td.object<IAssignmentHooks>();
        const client = new EppoClient(storage);
        client.getAssignment('subject-identifer', flagKey, {}, mockHooks);
        expect(td.explain(mockHooks.onPreAssignment).callCount).toEqual(1);
        expect(td.explain(mockHooks.onPreAssignment).calls[0].args[0]).toEqual(flagKey);
        expect(td.explain(mockHooks.onPreAssignment).calls[0].args[1]).toEqual('subject-identifer');
      });

      it('overrides returned assignment', async () => {
        const client = new EppoClient(storage);
        const mockLogger = td.object<IAssignmentLogger>();
        client.setLogger(mockLogger);
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
        const client = new EppoClient(storage);
        const mockLogger = td.object<IAssignmentLogger>();
        client.setLogger(mockLogger);
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

        expect(variation).not.toEqual(null);
        expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      });
    });

    describe('onPostAssignment', () => {
      it('called with assigned variation after assignment', async () => {
        const mockHooks = td.object<IAssignmentHooks>();
        const subject = 'subject-identifier';
        const client = new EppoClient(storage);
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
