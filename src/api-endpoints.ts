import { ISdkParams } from './http-client';

const UFC_ENDPOINT = '/flag-config/v1/config';
const BANDIT_ENDPOINT = '/flag-config/v1/bandits';

/** Utility class for constructing an Eppo API endpoint URL given a provided baseUrl and query parameters */
export default class ApiEndpoints {
  constructor(private readonly baseUrl: string, private readonly queryParams: ISdkParams) {}

  endpoint(resource: string): URL {
    const url = new URL(this.baseUrl + resource);
    Object.entries(this.queryParams).forEach(([key, value]) => url.searchParams.append(key, value));
    return url;
  }

  ufcEndpoint(): URL {
    return this.endpoint(UFC_ENDPOINT);
  }

  banditParametersEndpoint(): URL {
    return this.endpoint(BANDIT_ENDPOINT);
  }
}
