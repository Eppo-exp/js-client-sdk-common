/**
 * @jest-environment jsdom
 */
import * as td from 'testdouble';
import mock from 'xhr-mock';

import { getInstance, init } from '..';
import {
  IAssignmentTestCase,
  readAssignmentTestData,
  readMockRacResponse,
} from '../../test/testHelpers';
import { IAssignmentLogger } from '../assignment-logger';
import { MAX_EVENT_QUEUE_SIZE } from '../constants';
import { OperatorType } from '../dto/rule-dto';
import { EppoLocalStorage } from '../local-storage';
import { EppoSessionStorage } from '../session-storage';

import EppoClient from './eppo-client';

describe('EppoClient E2E test', () => {
  const sessionOverrideSubject = 'subject-14';
  const sessionOverrideExperiment = 'exp-100';
  const preloadedConfigExperiment = 'randomization_algo';
  beforeAll(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mock.setup();
    mock.get(/randomized_assignment\/v2\/config*/, (_req, res) => {
      const rac = readMockRacResponse();
      return res.status(200).body(JSON.stringify(rac));
    });
    const preloadedConfig = {
      name: preloadedConfigExperiment,
      enabled: true,
      subjectShards: 100,
      overrides: {
        '5160f8b1a59fb002f8535257206cb824': 'preloaded-config-variation',
      },
    };
    window.localStorage.setItem(preloadedConfigExperiment, JSON.stringify(preloadedConfig));
    getInstance().getAssignment(sessionOverrideSubject, preloadedConfigExperiment);
    getInstance().getAssignment(sessionOverrideSubject, sessionOverrideExperiment);
    const assignmentLogger: IAssignmentLogger = {
      logAssignment(assignment) {
        console.log(`Logged assignment for subject ${assignment.subject}`);
      },
    };
    await init({ apiKey: 'dummy', baseUrl: 'http://127.0.0.1:4000', assignmentLogger });
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
      window.localStorage.setItem(experimentName, JSON.stringify(mockExperimentConfig));
    });

    it('Invokes logger for queued events', () => {
      const mockLogger = td.object<IAssignmentLogger>();
      const client = new EppoClient(new EppoLocalStorage(), new EppoSessionStorage());
      client.getAssignment('subject-to-be-logged', experimentName);
      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      expect(td.explain(mockLogger.logAssignment).calls[0].args[0].subject).toEqual(
        'subject-to-be-logged',
      );
    });

    it('Does not log same queued event twice', () => {
      const mockLogger = td.object<IAssignmentLogger>();
      const client = new EppoClient(new EppoLocalStorage(), new EppoSessionStorage());
      client.getAssignment('subject-to-be-logged', experimentName);
      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
      client.setLogger(mockLogger);
      expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    });

    it('Does not invoke logger for events that exceed queue size', () => {
      const mockLogger = td.object<IAssignmentLogger>();
      const client = new EppoClient(new EppoLocalStorage(), new EppoSessionStorage());
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
        console.log(`---- Test Case for ${experiment} Experiment ----`);
        const assignments = subjectsWithAttributes
          ? getAssignmentsWithSubjectAttributes(subjectsWithAttributes, experiment)
          : getAssignments(subjects, experiment);
        expect(assignments).toEqual(expectedAssignments);
      },
    );
  });

  it('returns null if getAssignment was called for the subject before any RAC was loaded', () => {
    expect(getInstance().getAssignment(sessionOverrideSubject, sessionOverrideExperiment)).toEqual(
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
    const client = new EppoClient(new EppoLocalStorage(), new EppoSessionStorage());
    const assignment = client.getAssignment('subject-10', experimentName);
    expect(assignment).toEqual('control');
  });

  it('returns subject from overrides when enabled is false', () => {
    window.localStorage.setItem(
      experimentName,
      JSON.stringify({
        ...mockExperimentConfig,
        enabled: false,
        overrides: {
          '1b50f33aef8f681a13f623963da967ed': 'control',
        },
      }),
    );
    const client = new EppoClient(new EppoLocalStorage(), new EppoSessionStorage());
    const assignment = client.getAssignment('subject-10', experimentName);
    expect(assignment).toEqual('control');
  });

  it('logs variation assignment', () => {
    const mockLogger = td.object<IAssignmentLogger>();
    window.localStorage.setItem(experimentName, JSON.stringify(mockExperimentConfig));
    const subjectAttributes = { foo: 3 };
    const client = new EppoClient(new EppoLocalStorage(), new EppoSessionStorage());
    client.setLogger(mockLogger);
    const assignment = client.getAssignment('subject-10', experimentName, subjectAttributes);
    expect(assignment).toEqual('control');
    expect(td.explain(mockLogger.logAssignment).callCount).toEqual(1);
    expect(td.explain(mockLogger.logAssignment).calls[0].args[0].subject).toEqual('subject-10');
  });

  it('handles logging exception', () => {
    const mockLogger = td.object<IAssignmentLogger>();
    td.when(mockLogger.logAssignment(td.matchers.anything())).thenThrow(new Error('logging error'));
    window.localStorage.setItem(experimentName, JSON.stringify(mockExperimentConfig));
    const subjectAttributes = { foo: 3 };
    const client = new EppoClient(new EppoLocalStorage(), new EppoSessionStorage());
    client.setLogger(mockLogger);
    const assignment = client.getAssignment('subject-10', experimentName, subjectAttributes);
    expect(assignment).toEqual('control');
  });

  it('only returns variation if subject matches rules', () => {
    window.localStorage.setItem(
      experimentName,
      JSON.stringify({
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
      }),
    );
    const client = new EppoClient(new EppoLocalStorage(), new EppoSessionStorage());
    let assignment = client.getAssignment('subject-10', experimentName, { appVersion: 9 });
    expect(assignment).toEqual(null);
    assignment = client.getAssignment('subject-10', experimentName);
    expect(assignment).toEqual(null);
    assignment = client.getAssignment('subject-10', experimentName, { appVersion: 11 });
    expect(assignment).toEqual('control');
  });

  function getAssignments(subjects: string[], experiment: string): string[] {
    const client = getInstance();
    return subjects.map((subjectKey) => {
      return client.getAssignment(subjectKey, experiment);
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
    const client = getInstance();
    return subjectsWithAttributes.map((subject) => {
      return client.getAssignment(subject.subjectKey, experiment, subject.subjectAttributes);
    });
  }
});
