import axios from 'axios';

import { IAssignmentLogger } from './assignment-logger';
import { BASE_URL, REQUEST_TIMEOUT_MILLIS } from './constants';
import EppoClient, { IEppoClient } from './eppo-client';
import ExperimentConfigurationRequestor from './experiment/experiment-configuration-requestor';
import HttpClient from './http-client';
import { sdkName, sdkVersion } from './sdk-data';
import { EppoSessionStorage } from './storage';
import { validateNotBlank } from './validation';

/**
 * Configuration used for initializing the Eppo client
 * @public
 */
export interface IClientConfig {
  /**
   * Eppo API key
   */
  apiKey: string;

  /**
   * Base URL of the Eppo API.
   * Clients should use the default setting in most cases.
   */
  baseUrl?: string;

  /**
   * Pass a logging implementation to send variation assignments to your data warehouse.
   */
  assignmentLogger?: IAssignmentLogger;
}

export { IAssignmentLogger, IAssignmentEvent } from './assignment-logger';
export { IEppoClient } from './eppo-client';

let clientInstance: IEppoClient = null;

/**
 * Initializes the Eppo client with configuration parameters.
 * This method should be called once on application startup.
 * After invocation of this method, the SDK will poll Eppo's API at regular intervals to retrieve assignment configurations.
 * @param config client configuration
 * @public
 */
export async function init(config: IClientConfig): Promise<IEppoClient> {
  validateNotBlank(config.apiKey, 'API key required');
  const configurationStore = new EppoSessionStorage();
  const axiosInstance = axios.create({
    baseURL: config.baseUrl || BASE_URL,
    timeout: REQUEST_TIMEOUT_MILLIS,
  });
  const httpClient = new HttpClient(axiosInstance, {
    apiKey: config.apiKey,
    sdkName,
    sdkVersion,
  });
  const configurationRequestor = new ExperimentConfigurationRequestor(
    configurationStore,
    httpClient,
  );
  clientInstance = new EppoClient(configurationRequestor, config.assignmentLogger);
  if (!configurationStore.isInitialized()) {
    await configurationRequestor.fetchAndStoreConfigurations();
  }
  return clientInstance;
}

/**
 * Used to access a singleton SDK client instance.
 * Use the method after calling init() to initialize the client.
 * @returns a singleton client instance
 */
export function getInstance(): IEppoClient {
  if (!clientInstance) {
    throw Error('Expected init() to be called to initialize a client instance');
  }
  return clientInstance;
}
