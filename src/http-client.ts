export interface ISdkParams {
  apiKey: string;
  sdkVersion: string;
  sdkName: string;
}

export class HttpRequestError extends Error {
  constructor(public message: string, public status: number) {
    super(message);
  }
}

export interface IHttpClient {
  get<T>(resource: string): Promise<T | undefined>;
}

export default class FetchHttpClient implements IHttpClient {
  constructor(private baseUrl: string, private sdkParams: ISdkParams, private timeout: number) {}

  async get<T>(resource: string): Promise<T | undefined> {
    const url = new URL(this.baseUrl + resource);
    Object.keys(this.sdkParams).forEach((key) =>
      url.searchParams.append(key, this.sdkParams[key as keyof ISdkParams]),
    );

    try {
      // Canonical implementation of abortable fetch for interrupting when request takes longer than desired.
      // https://developer.chrome.com/blog/abortable-fetch/#reacting_to_an_aborted_fetch
      const controller = new AbortController();
      const signal = controller.signal;
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      const response = await fetch(url.toString(), { signal: signal });
      // Clear timeout when response is received within the budget.
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new HttpRequestError('Failed to fetch data', response.status);
      }
      return response.json() as Promise<T>;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new HttpRequestError('Request timed out', 408);
      } else if (error instanceof HttpRequestError) {
        throw error;
      }

      throw new HttpRequestError('Network error', 0);
    }
  }
}
