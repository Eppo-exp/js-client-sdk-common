import { BASE_URL as DEFAULT_BASE_URL, UFC_ENDPOINT } from './constants';
import { ISdkParams } from './http-client';

interface IApiEndpointsParams {
  queryParams: ISdkParams;
  baseUrl?: string;
}

/** Utility class for constructing an Eppo API endpoint URL given a provided baseUrl and query parameters */
export default class ApiEndpoints {
  constructor(private readonly params: IApiEndpointsParams) {
    this.params.baseUrl = params.baseUrl ?? DEFAULT_BASE_URL;
  }

  endpoint(resource: string): URL {
    const url = new URL(this.params.baseUrl + resource);
    Object.entries(this.params.queryParams).forEach(([key, value]) =>
      url.searchParams.append(key, value),
    );
    return url;
  }

  ufcEndpoint(): URL {
    return this.endpoint(UFC_ENDPOINT);
  }
}
