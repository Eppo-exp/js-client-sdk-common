import {
  readAssignmentTestData,
  IAssignmentTestCase,
  getTestAssignmentDetails,
  validateTestAssignmentDetails,
  MOCK_UFC_RESPONSE_FILE,
  readMockUFCResponse,
} from '../../test/testHelpers';
import ApiEndpoints from '../api-endpoints';
import { IConfigurationStore } from '../configuration-store/configuration-store';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import FlagConfigurationRequestor from '../flag-configuration-requestor';
import { AllocationEvaluationCode } from '../flag-evaluation-details-builder';
import FetchHttpClient from '../http-client';
import { Flag, ObfuscatedFlag, VariationType } from '../interfaces';
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
  const configurationRequestor = new FlagConfigurationRequestor(configurationStore, httpClient);
  await configurationRequestor.fetchAndStoreConfigurations();
}

describe('EppoClient get*AssignmentDetails', () => {
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
      value: 3,
      environment: 'Test',
      variationKey: 'three',
      variationValue: 3,
      flagEvaluationCode: 'MATCH',
      flagEvaluationDescription:
        'Supplied attributes match rules defined in allocation "targeted allocation".',
      configFetchedAt: expect.any(String),
      configPublishedAt: expect.any(String),
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
        name: 'Allocation for targeted allocation',
        allocationEvaluationCode: AllocationEvaluationCode.MATCH,
        orderPosition: 0,
      },
      unmatchedAllocations: [],
      unevaluatedAllocations: [
        {
          key: '50/50 split',
          name: 'Allocation for 50/50 split',
          allocationEvaluationCode: AllocationEvaluationCode.UNEVALUATED,
          orderPosition: 1,
        },
      ],
    };
    expect(result).toMatchObject(expected);
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
      value: 2,
      environment: 'Test',
      variationKey: 'two',
      variationValue: 2,
      flagEvaluationCode: 'MATCH',
      flagEvaluationDescription:
        'alice belongs to the range of traffic assigned to "two" defined in allocation "50/50 split".',
      configFetchedAt: expect.any(String),
      configPublishedAt: expect.any(String),
      matchedRule: null,
      matchedAllocation: {
        key: '50/50 split',
        name: 'Allocation for 50/50 split',
        allocationEvaluationCode: AllocationEvaluationCode.MATCH,
        orderPosition: 2,
      },
      unmatchedAllocations: [
        {
          key: 'targeted allocation',
          name: 'Allocation for targeted allocation',
          allocationEvaluationCode: AllocationEvaluationCode.FAILING_RULE,
          orderPosition: 1,
        },
      ],
      unevaluatedAllocations: [],
    };
    expect(result).toMatchObject(expected);
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
      value: 'control',
      environment: 'Test',
      flagEvaluationCode: 'MATCH',
      flagEvaluationDescription:
        'Supplied attributes match rules defined in allocation "experiment" and alice belongs to the range of traffic assigned to "control".',
      variationKey: 'control',
      variationValue: 'control',
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
        name: 'Allocation for experiment',
        allocationEvaluationCode: AllocationEvaluationCode.MATCH,
        orderPosition: 2,
      },
      unmatchedAllocations: [
        {
          key: 'id rule',
          name: 'Allocation for id rule',
          allocationEvaluationCode: AllocationEvaluationCode.FAILING_RULE,
          orderPosition: 0,
        },
        {
          key: 'internal users',
          name: 'Allocation for internal users',
          allocationEvaluationCode: AllocationEvaluationCode.FAILING_RULE,
          orderPosition: 1,
        },
      ],
      unevaluatedAllocations: [
        {
          key: 'rollout',
          name: 'Allocation for rollout',
          allocationEvaluationCode: AllocationEvaluationCode.UNEVALUATED,
          orderPosition: 3,
        },
      ],
    };
    expect(result).toMatchObject(expected);
  });

  it('should handle unrecognized flags', () => {
    const client = new EppoClient(storage);
    client.setIsGracefulFailureMode(false);
    const result = client.getIntegerAssignmentDetails('asdf', 'alice', {}, 0);
    expect(result).toMatchObject({
      value: 0,
      environment: 'Test',
      flagEvaluationCode: 'FLAG_UNRECOGNIZED_OR_DISABLED',
      flagEvaluationDescription: 'Unrecognized or disabled flag: asdf',
      variationKey: null,
      variationValue: null,
      configFetchedAt: expect.any(String),
      configPublishedAt: expect.any(String),
      matchedRule: null,
      matchedAllocation: null,
      unmatchedAllocations: [],
      unevaluatedAllocations: [],
    } as IAssignmentDetails<number>);
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
      'test variation assignment details',
      async ({ flag, variationType, defaultValue, subjects }: IAssignmentTestCase) => {
        const client = new EppoClient(storage);
        client.setIsGracefulFailureMode(false);

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

        const assignments = getTestAssignmentDetails(
          { flag, variationType, defaultValue, subjects },
          assignmentFn,
        );

        validateTestAssignmentDetails(assignments, flag);
      },
    );
  });
});
