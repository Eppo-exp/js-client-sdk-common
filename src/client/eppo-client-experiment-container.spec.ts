import { MOCK_UFC_RESPONSE_FILE, readMockUFCResponse } from '../../test/testHelpers';
import * as applicationLogger from '../application-logger';
import { MemoryOnlyConfigurationStore } from '../configuration-store/memory.store';
import { Flag, ObfuscatedFlag } from '../interfaces';

import EppoClient, { IFlagExperiment } from './eppo-client';
import { initConfiguration } from './test-utils';

type Container = { name: string };

describe('getExperimentContainer', () => {
  global.fetch = jest.fn(() => {
    const ufc = readMockUFCResponse(MOCK_UFC_RESPONSE_FILE);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(ufc),
    });
  }) as jest.Mock;

  const controlContainer: Container = { name: 'Control Container' };
  const variation1Container: Container = { name: 'Variation 1 Container' };
  const variation2Container: Container = { name: 'Variation 2 Container' };
  const variation3Container: Container = { name: 'Variation 3 Container' };

  let client: EppoClient;
  let flagExperiment: IFlagExperiment<Container>;
  let getStringAssignmentSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    const storage = new MemoryOnlyConfigurationStore<Flag | ObfuscatedFlag>();
    await initConfiguration(storage);
    client = new EppoClient(storage);
    client.setIsGracefulFailureMode(true);
    flagExperiment = {
      flagKey: 'my-key',
      controlVariation: controlContainer,
      treatmentVariations: [variation1Container, variation2Container, variation3Container],
    };
    getStringAssignmentSpy = jest.spyOn(client, 'getStringAssignment');
    loggerWarnSpy = jest.spyOn(applicationLogger.logger, 'warn');
  });

  afterAll(() => {
    getStringAssignmentSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  it('should return the right container when a variation is assigned', async () => {
    jest.spyOn(client, 'getStringAssignment').mockReturnValue('variation-2');
    expect(client.getExperimentContainer(flagExperiment, 'subject-key', {})).toEqual(
      variation2Container,
    );

    jest.spyOn(client, 'getStringAssignment').mockReturnValue('variation-3');
    expect(client.getExperimentContainer(flagExperiment, 'subject-key', {})).toEqual(
      variation3Container,
    );
  });

  it('should return the right container when control is assigned', async () => {
    jest.spyOn(client, 'getStringAssignment').mockReturnValue('control');
    expect(client.getExperimentContainer(flagExperiment, 'subject-key', {})).toEqual(
      controlContainer,
    );
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('should default to the control container if an unknown variation is assigned', async () => {
    jest.spyOn(client, 'getStringAssignment').mockReturnValue('adsfsadfsadf');
    expect(client.getExperimentContainer(flagExperiment, 'subject-key', {})).toEqual(
      controlContainer,
    );
    expect(loggerWarnSpy).toHaveBeenCalled();
  });

  it('should default to the control container if an out-of-bounds variation is assigned', async () => {
    jest.spyOn(client, 'getStringAssignment').mockReturnValue('variation-9');
    expect(client.getExperimentContainer(flagExperiment, 'subject-key', {})).toEqual(
      controlContainer,
    );
    expect(loggerWarnSpy).toHaveBeenCalled();
  });
});
