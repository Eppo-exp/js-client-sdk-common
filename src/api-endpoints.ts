import { BASE_URL as DEFAULT_BASE_URL, UFC_ENDPOINT } from './constants';
import { ISdkParams } from './http-client';

/** Utility class for constructing an Eppo API endpoint URL given a provided baseUrl and query parameters */
export default class ApiEndpoints {
  constructor(
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    private readonly queryParams: ISdkParams,
  ) {}

  endpoint(resource: string): URL {
    const url = new URL(this.baseUrl + resource);
    Object.entries(this.queryParams).forEach(([key, value]) => url.searchParams.append(key, value));
    return url;
  }

  ufcEndpoint(): URL {
    return this.endpoint(UFC_ENDPOINT);
  }
}
