/**
 * @jest-environment jsdom
 */
import axios from 'axios';
import * as td from 'testdouble';
import mock from 'xhr-mock';

import {
  IAssignmentTestCase,
  readAssignmentTestData,
  readMockRacResponse,
} from '../../test/testHelpers';
import { IAssignmentLogger } from '../assignment-logger';
import { IConfigurationStore } from '../configuration-store';
import { MAX_EVENT_QUEUE_SIZE } from '../constants';
import { OperatorType } from '../dto/rule-dto';
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

  const experimentName = 'mock-experiment';

  const mockExperimentConfig = {
    name: experimentName,
    enabled: true,
    subjectShards: 100,
    overrides: {},
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
            shardRange: {
              start: 0,
              end: 34,
            },
          },
          {
            name: 'variant-1',
            value: 'variant-1',
            shardRange: {
              start: 34,
              end: 67,
            },
          },
          {
            name: 'variant-2',
            value: 'variant-2',
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
      storage.setEntries({ [experimentName]: mockExperimentConfig });
    });

    it('Invokes logger for queued events', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const client = new EppoClient(storage);
      client.getAssignment('subject-to-be-logged', experimentName);
      client.setLogger(mockLogger);

      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].subject).toEqual(
        'subject-to-be-logged',
      );
    });

    it('Does not log same queued event twice', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const client = new EppoClient(storage);

      client.getAssignment('subject-to-be-logged', experimentName);
      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);

      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    });

    it('Does not invoke logger for events that exceed queue size', () => {
      const mockLogger = td.object<IAssignmentLogger>();

      const client = new EppoClient(storage);
      for (let i = 0; i < MAX_EVENT_QUEUE_SIZE + 100; i++) {
        client.getAssignment(`subject-to-be-logged-${i}`, experimentName);
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
        subjects,
        subjectsWithAttributes,
        expectedAssignments,
      }: IAssignmentTestCase) => {
        `---- Test Case for ${experiment} Experiment ----`;
        const assignments = subjectsWithAttributes
          ? getAssignmentsWithSubjectAttributes(subjectsWithAttributes, experiment)
          : getAssignments(subjects, experiment);
        expect(assignments).toEqual(expectedAssignments);
      },
    );
  });

  it('returns null if getAssignment was called for the subject before any RAC was loaded', () => {
    expect(globalClient.getAssignment(sessionOverrideSubject, sessionOverrideExperiment)).toEqual(
      null,
    );
  });

  it('returns subject from overrides when enabled is true', () => {
    window.localStorage.setItem(
      experimentName,
      JSON.stringify({
        ...mockExperimentConfig,
        overrides: {
          '1b50f33aef8f681a13f623963da967ed': 'control',
        },
      }),
    );
    const client = new EppoClient(storage);
    const assignment = client.getAssignment('subject-10', experimentName);
    expect(assignment).toEqual('control');
  });

  it('returns subject from overrides when enabled is false', () => {
    const entry = {
      ...mockExperimentConfig,
      enabled: false,
      overrides: {
        '1b50f33aef8f681a13f623963da967ed': 'control',
      },
    };

    storage.setEntries({ [experimentName]: entry });

    const client = new EppoClient(storage);
    const assignment = client.getAssignment('subject-10', experimentName);
    expect(assignment).toEqual('control');
  });

  it('logs variation assignment', () => {
    const mockLogger = td.object<IAssignmentLogger>();

    storage.setEntries({ [experimentName]: mockExperimentConfig });
    const client = new EppoClient(storage);
    client.setLogger(mockLogger);

    const subjectAttributes = { foo: 3 };
    const assignment = client.getAssignment('subject-10', experimentName, subjectAttributes);

    expect(assignment).toEqual('control');
    expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    expect(td.explain(mockLogger.logAssignment).calls[0].args[0].subject).toEqual('subject-10');
  });

  it('handles logging exception', () => {
    const mockLogger = td.object<IAssignmentLogger>();
    td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(new Error('logging error'));

    storage.setEntries({ [experimentName]: mockExperimentConfig });
    const client = new EppoClient(storage);
    client.setLogger(mockLogger);

    const subjectAttributes = { foo: 3 };
    const assignment = client.getAssignment('subject-10', experimentName, subjectAttributes);

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

    storage.setEntries({ [experimentName]: entry });

    const client = new EppoClient(storage);
    let assignment = client.getAssignment('subject-10', experimentName, { appVersion: 9 });
    expect(assignment).toEqual(null);
    assignment = client.getAssignment('subject-10', experimentName);
    expect(assignment).toEqual(null);
    assignment = client.getAssignment('subject-10', experimentName, { appVersion: 11 });
    expect(assignment).toEqual('control');
  });

  function getAssignments(subjects: string[], experiment: string): string[] {
    return subjects.map((subjectKey) => {
      return globalClient.getAssignment(subjectKey, experiment);
    });
  }

  function getAssignmentsWithSubjectAttributes(
    subjectsWithAttributes: {
      subjectKey: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subjectAttributes: Record<string, any>;
    }[],
    experiment: string,
  ): string[] {
    return subjectsWithAttributes.map((subject) => {
      return globalClient.getAssignment(subject.subjectKey, experiment, subject.subjectAttributes);
    });
  }
});
