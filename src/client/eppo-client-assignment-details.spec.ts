import * as fs from 'fs';

import {
  IAssignmentTestCase,
  MOCK_UFC_RESPONSE_FILE,
  readMockUFCResponse,
} from '../../test/testHelpers';
import ApiEndpoints from '../api-endpoints';
import ConfigurationRequestor from '../configuration-requestor';
import { IConfigurationStore } from '../configuration-store/configuration-store';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import { AllocationEvaluationCode } from '../flag-evaluation-details-builder';
import FetchHttpClient from '../http-client';
import { Flag, ObfuscatedFlag, Variation, VariationType } from '../interfaces';
import { OperatorType } from '../rules';

import EppoClient, { IAssignmentDetails } from './eppo-client';

async function init(configurationStore: IConfigurationStore<Flag | ObfuscatedFlag>) {
  const apiEndpoints = new ApiEndpoints({
    baseUrl: 'http://127.0.0.1:4000',
    queryParams: {
      apiKey: 'dummy',
      sdkName: 'js-client-sdk-common',
      sdkVersion: '1.0.0',
    },
  });
  const httpClient = new FetchHttpClient(apiEndpoints, 1000);
  const configurationRequestor = new ConfigurationRequestor(
    httpClient,
    configurationStore,
    null,
    null,
  );
  await configurationRequestor.fetchAndStoreConfigurations();
}

describe('EppoClient get*AssignmentDetails', () => {
  const testStart = Date.now();

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

  it('should set the details for a matched rule', () => {
    const client = new EppoClient(storage);
    client.setIsGracefulFailureMode(false);
    const subjectAttributes = { email: 'alice@mycompany.com', country: 'US' };
    const result = client.getIntegerAssignmentDetails(
      'integer-flag',
      'alice',
      subjectAttributes,
      0,
    );
    const expected: IAssignmentDetails<number> = {
      variation: 3,
      action: null,
      evaluationDetails: {
        environmentName: 'Test',
        variationKey: 'three',
        variationValue: 3,
        banditKey: null,
        banditAction: null,
        flagEvaluationCode: 'MATCH',
        flagEvaluationDescription:
          'Supplied attributes match rules defined in allocation "targeted allocation".',
        configFetchedAt: expect.any(String),
        configPublishedAt: '2024-04-17T19:40:53.716Z',
        matchedRule: {
          conditions: [
            {
              attribute: 'country',
              operator: OperatorType.ONE_OF,
              value: ['US', 'Canada', 'Mexico'],
            },
          ],
        },
        matchedAllocation: {
          key: 'targeted allocation',
          allocationEvaluationCode: AllocationEvaluationCode.MATCH,
          orderPosition: 1,
        },
        unmatchedAllocations: [],
        unevaluatedAllocations: [
          {
            key: '50/50 split',
            allocationEvaluationCode: AllocationEvaluationCode.UNEVALUATED,
            orderPosition: 2,
          },
        ],
      },
    };
    expect(Date.parse(result.evaluationDetails.configFetchedAt)).toBeGreaterThanOrEqual(testStart);
    expect(result).toEqual(expected);
  });

  it('should set the details for a matched split', () => {
    const client = new EppoClient(storage);
    client.setIsGracefulFailureMode(false);
    const subjectAttributes = { email: 'alice@mycompany.com', country: 'Brazil' };
    const result = client.getIntegerAssignmentDetails(
      'integer-flag',
      'alice',
      subjectAttributes,
      0,
    );
    const expected: IAssignmentDetails<number> = {
      variation: 2,
      action: null,
      evaluationDetails: {
        environmentName: 'Test',
        variationKey: 'two',
        variationValue: 2,
        banditKey: null,
        banditAction: null,
        flagEvaluationCode: 'MATCH',
        flagEvaluationDescription:
          'alice belongs to the range of traffic assigned to "two" defined in allocation "50/50 split".',
        configFetchedAt: expect.any(String),
        configPublishedAt: expect.any(String),
        matchedRule: null,
        matchedAllocation: {
          key: '50/50 split',
          allocationEvaluationCode: AllocationEvaluationCode.MATCH,
          orderPosition: 2,
        },
        unmatchedAllocations: [
          {
            key: 'targeted allocation',
            allocationEvaluationCode: AllocationEvaluationCode.FAILING_RULE,
            orderPosition: 1,
          },
        ],
        unevaluatedAllocations: [],
      },
    };
    expect(result).toEqual(expected);
  });

  it('should handle matching a split allocation with a matched rule', () => {
    const client = new EppoClient(storage);
    client.setIsGracefulFailureMode(false);
    const subjectAttributes = { id: 'alice', email: 'alice@external.com', country: 'Brazil' };
    const result = client.getStringAssignmentDetails(
      'new-user-onboarding',
      'alice',
      subjectAttributes,
      '',
    );
    const expected: IAssignmentDetails<string> = {
      variation: 'control',
      action: null,
      evaluationDetails: {
        environmentName: 'Test',
        flagEvaluationCode: 'MATCH',
        flagEvaluationDescription:
          'Supplied attributes match rules defined in allocation "experiment" and alice belongs to the range of traffic assigned to "control".',
        variationKey: 'control',
        variationValue: 'control',
        banditKey: null,
        banditAction: null,
        configFetchedAt: expect.any(String),
        configPublishedAt: expect.any(String),
        matchedRule: {
          conditions: [
            {
              attribute: 'country',
              operator: OperatorType.NOT_ONE_OF,
              value: ['US', 'Canada', 'Mexico'],
            },
          ],
        },
        matchedAllocation: {
          key: 'experiment',
          allocationEvaluationCode: AllocationEvaluationCode.MATCH,
          orderPosition: 3,
        },
        unmatchedAllocations: [
          {
            key: 'id rule',
            allocationEvaluationCode: AllocationEvaluationCode.FAILING_RULE,
            orderPosition: 1,
          },
          {
            key: 'internal users',
            allocationEvaluationCode: AllocationEvaluationCode.FAILING_RULE,
            orderPosition: 2,
          },
        ],
        unevaluatedAllocations: [
          {
            key: 'rollout',
            allocationEvaluationCode: AllocationEvaluationCode.UNEVALUATED,
            orderPosition: 4,
          },
        ],
      },
    };
    expect(result).toEqual(expected);
  });

  it('should handle unrecognized flags', () => {
    const client = new EppoClient(storage);
    client.setIsGracefulFailureMode(false);
    const result = client.getIntegerAssignmentDetails('asdf', 'alice', {}, 0);
    expect(result).toEqual({
      variation: 0,
      action: null,
      evaluationDetails: {
        environmentName: 'Test',
        flagEvaluationCode: 'FLAG_UNRECOGNIZED_OR_DISABLED',
        flagEvaluationDescription: 'Unrecognized or disabled flag: asdf',
        variationKey: null,
        variationValue: null,
        banditKey: null,
        banditAction: null,
        configFetchedAt: expect.any(String),
        configPublishedAt: expect.any(String),
        matchedRule: null,
        matchedAllocation: null,
        unmatchedAllocations: [],
        unevaluatedAllocations: [],
      },
    } as IAssignmentDetails<number>);
  });

  describe('UFC General Test Cases', () => {
    const testStart = Date.now();

    const getTestFilePaths = () => {
      const testDir = 'test/data/ufc/tests';
      return fs.readdirSync(testDir).map((testFilename) => `${testDir}/${testFilename}`);
    };

    const parseJSON = (testFilePath: string) => {
      try {
        const fileContents = fs.readFileSync(testFilePath, 'utf-8');
        const parsedJSON = JSON.parse(fileContents);
        return parsedJSON as IAssignmentTestCase;
      } catch (err) {
        console.error(`failed to parse JSON in ${testFilePath}`);
        console.error(err);
        process.exit(1);
      }
    };

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

    describe.each(getTestFilePaths())('for file: %s', (testFilePath: string) => {
      const testCase = parseJSON(testFilePath);
      describe.each(testCase.subjects.map(({ subjectKey }) => subjectKey))(
        'with subjectKey %s',
        (subjectKey) => {
          const { flag, variationType, defaultValue, subjects } = testCase;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const subject = subjects.find((subject) => subject.subjectKey === subjectKey)!;

          const client = new EppoClient(storage);
          client.setIsGracefulFailureMode(false);

          const focusOn = {
            testFilePath: '', // focus on test file paths (don't forget to set back to empty string!)
            subjectKey: '', // focus on subject (don't forget to set back to empty string!)
          };

          const shouldRunTestForFilePath =
            !focusOn.testFilePath || focusOn.testFilePath === testFilePath;

          const shouldRunTestForSubject = !focusOn.subjectKey || focusOn.subjectKey === subjectKey;

          if (shouldRunTestForFilePath && shouldRunTestForSubject) {
            it('handles variation assignment details', async () => {
              const typeAssignmentDetailsFunctions = {
                [VariationType.BOOLEAN]: client.getBooleanAssignmentDetails.bind(client),
                [VariationType.NUMERIC]: client.getNumericAssignmentDetails.bind(client),
                [VariationType.INTEGER]: client.getIntegerAssignmentDetails.bind(client),
                [VariationType.STRING]: client.getStringAssignmentDetails.bind(client),
                [VariationType.JSON]: client.getJSONAssignmentDetails.bind(client),
              };
              const assignmentFn = typeAssignmentDetailsFunctions[variationType];
              if (!assignmentFn) {
                throw new Error(`Unknown variation type: ${variationType}`);
              }
              const result: IAssignmentDetails<Variation['value'] | object> = assignmentFn(
                flag,
                subject.subjectKey,
                subject.subjectAttributes,
                defaultValue,
              );
              expect(result.variation).toEqual(subject.assignment);
              expect(result.evaluationDetails).toEqual({
                ...subject.evaluationDetails,
                configFetchedAt: expect.any(String),
                configPublishedAt: expect.any(String),
              });
              expect(result.evaluationDetails.configPublishedAt).toEqual(
                '2024-04-17T19:40:53.716Z',
              );
              expect(Date.parse(result.evaluationDetails.configFetchedAt)).toBeGreaterThanOrEqual(
                testStart,
              );
            });
          }
        },
      );
    });
  });
});
