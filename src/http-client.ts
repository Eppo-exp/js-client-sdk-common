import ApiEndpoints from './api-endpoints';
import { Flag } from './interfaces';

export interface ISdkParams {
  apiKey: string;
  sdkVersion: string;
  sdkName: string;
}

export class HttpRequestError extends Error {
  constructor(public message: string, public status: number, public cause?: Error) {
    super(message);
    if (cause) {
      this.cause = cause;
    }
  }
}

export interface IUniversalFlagConfig {
  flags: Record<string, Flag>;
}

export interface IHttpClient {
  getUniversalFlagConfiguration(): Promise<IUniversalFlagConfig | undefined>;
  rawGet<T>(url: URL): Promise<T | undefined>;
}

export default class FetchHttpClient implements IHttpClient {
  constructor(private readonly apiEndpoints: ApiEndpoints, private readonly timeout: number) {}

  async getUniversalFlagConfiguration(): Promise<IUniversalFlagConfig | undefined> {
    const url = this.apiEndpoints.ufcEndpoint();
    return await this.rawGet<IUniversalFlagConfig>(url);
  }

  async rawGet<T>(url: URL): Promise<T | undefined> {
    try {
      // Canonical implementation of abortable fetch for interrupting when request takes longer than desired.
      // https://developer.chrome.com/blog/abortable-fetch/#reacting_to_an_aborted_fetch
      const controller = new AbortController();
      const signal = controller.signal;
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      const response = await fetch(url.toString(), { signal });
      // Clear timeout when response is received within the budget.
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new HttpRequestError('Failed to fetch data', response.status);
      }
      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new HttpRequestError('Request timed out', 408, error);
      } else if (error instanceof HttpRequestError) {
        throw error;
      }

      throw new HttpRequestError('Network error', 0, error);
    }
  }
}
