/**
 * @jest-environment jsdom
 */
import * as td from 'testdouble';
import mock from 'xhr-mock';

import { IAssignmentTestCase, readAssignmentTestData } from '../test/testHelpers';

import EppoClient from './eppo-client';
import { IExperimentConfiguration } from './experiment/experiment-configuration';
import ExperimentConfigurationRequestor from './experiment/experiment-configuration-requestor';
import { IVariation } from './experiment/variation';
import { OperatorType } from './rule';

import { init } from '.';

describe('EppoClient E2E test', () => {
  beforeAll(() => {
    window.sessionStorage.clear();
    mock.setup();
    mock.get(/randomized_assignment\/config*/, (_req, res) => {
      const testCases: IAssignmentTestCase[] = readAssignmentTestData();
      const assignmentConfig: Record<string, IExperimentConfiguration> = {};
      testCases.forEach(({ experiment, percentExposure, variations }) => {
        assignmentConfig[experiment] = {
          name: experiment,
          percentExposure,
          enabled: true,
          subjectShards: 10000,
          variations,
          overrides: {},
          rules: [],
        };
      });
      return res.status(200).body(JSON.stringify({ experiments: assignmentConfig }));
    });
  });

  afterAll(() => {
    mock.teardown();
  });

  describe('getAssignment', () => {
    it.each(readAssignmentTestData())(
      'test variation assignment splits',
      async ({
        variations,
        experiment,
        percentExposure,
        subjects,
        expectedAssignments,
      }: IAssignmentTestCase) => {
        console.log(`---- Test Case for ${experiment} Experiment ----`);
        const assignments = await getAssignments(subjects, experiment);
        // verify the assingments don't change across test runs (deterministic)
        expect(assignments).toEqual(expectedAssignments);
        const expectedVariationSplitPercentage = percentExposure / variations.length;
        const unassignedCount = assignments.filter((assignment) => assignment == null).length;
        expectToBeCloseToPercentage(unassignedCount / assignments.length, 1 - percentExposure);
        variations.forEach((variation) => {
          validateAssignmentCounts(assignments, expectedVariationSplitPercentage, variation);
        });
      },
    );
  });

  it('returns subject from overrides', () => {
    const mockConfigRequestor = td.object<ExperimentConfigurationRequestor>();
    const experiment = 'experiment_5';
    td.when(mockConfigRequestor.getConfiguration(experiment)).thenReturn({
      name: experiment,
      percentExposure: 1,
      enabled: true,
      subjectShards: 100,
      variations: [
        {
          name: 'control',
          shardRange: {
            start: 0,
            end: 33,
          },
        },
        {
          name: 'variant-1',
          shardRange: {
            start: 34,
            end: 66,
          },
        },
        {
          name: 'variant-2',
          shardRange: {
            start: 67,
            end: 100,
          },
        },
      ],
      overrides: {
        a90ea45116d251a43da56e03d3dd7275: 'variant-2',
      },
    });
    const client = new EppoClient('subject-1', mockConfigRequestor);
    const assignment = client.getAssignment(experiment);
    expect(assignment).toEqual('variant-2');
  });

  it('only returns variation if subject matches rules', () => {
    const mockConfigRequestor = td.object<ExperimentConfigurationRequestor>();
    const experiment = 'experiment_5';
    td.when(mockConfigRequestor.getConfiguration(experiment)).thenReturn({
      name: experiment,
      percentExposure: 1,
      enabled: true,
      subjectShards: 100,
      variations: [
        {
          name: 'control',
          shardRange: {
            start: 0,
            end: 50,
          },
        },
        {
          name: 'treatment',
          shardRange: {
            start: 50,
            end: 100,
          },
        },
      ],
      overrides: {},
      rules: [
        {
          conditions: [
            {
              operator: OperatorType.GT,
              attribute: 'appVersion',
              value: 10,
            },
          ],
        },
      ],
    });
    let client = new EppoClient('subject-1', mockConfigRequestor, { appVersion: 9 });
    let assignment = client.getAssignment(experiment);
    expect(assignment).toEqual(null);
    client = new EppoClient('subject-1', mockConfigRequestor);
    assignment = client.getAssignment(experiment);
    expect(assignment).toEqual(null);
    client = new EppoClient('subject-1', mockConfigRequestor, { appVersion: 11 });
    assignment = client.getAssignment(experiment);
    expect(assignment).toEqual('control');
  });

  function validateAssignmentCounts(
    assignments: string[],
    expectedPercentage: number,
    variation: IVariation,
  ) {
    const assignedCount = assignments.filter((assignment) => assignment === variation.name).length;
    console.log(
      `Expect variation ${variation.name} percentage of ${
        assignedCount / assignments.length
      } to be close to ${expectedPercentage}`,
    );
    expectToBeCloseToPercentage(assignedCount / assignments.length, expectedPercentage);
  }

  // expect assignment count to be within 5 percentage points of the expected count (because the hash output is random)
  function expectToBeCloseToPercentage(percentage: number, expectedPercentage: number) {
    expect(percentage).toBeGreaterThanOrEqual(expectedPercentage - 0.05);
    expect(percentage).toBeLessThanOrEqual(expectedPercentage + 0.05);
  }

  async function getAssignments(subjects: string[], experiment: string): Promise<string[]> {
    const assignments: string[] = [];
    for (const subjectKey of subjects) {
      const client = await init({
        apiKey: 'dummy',
        baseUrl: 'http://127.0.0.1:4000',
        subjectKey,
      });
      const assignment = client.getAssignment(experiment);
      assignments.push(assignment);
    }
    return assignments;
  }
});
