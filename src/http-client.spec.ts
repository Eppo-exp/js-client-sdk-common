import FetchHttpClient, { HttpRequestError, ISdkParams } from './http-client';

describe('FetchHttpClient', () => {
  const baseUrl = 'http://api.example.com';
  const sdkParams: ISdkParams = {
    apiKey: '12345',
    sdkVersion: '1.0',
    sdkName: 'ExampleSDK',
  };
  const timeout = 5000; // 5 seconds

  let httpClient: FetchHttpClient;

  beforeEach(() => {
    httpClient = new FetchHttpClient(baseUrl, sdkParams, timeout);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return data successfully when HTTP status is 200', async () => {
    const mockJsonPromise = Promise.resolve({ data: 'test' });
    const mockFetchPromise = Promise.resolve({
      ok: true,
      json: () => mockJsonPromise,
      status: 200,
    });
    (global.fetch as jest.Mock).mockImplementation(() => mockFetchPromise);

    const resource = '/data';
    const result = await httpClient.get(resource);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}${resource}?apiKey=12345&sdkVersion=1.0&sdkName=ExampleSDK`,
      { signal: expect.any(AbortSignal) },
    );
    expect(result).toEqual({ data: 'test' });
  });

  it('should throw HttpRequestError when HTTP status is not 200', async () => {
    const mockFetchPromise = Promise.resolve({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
    (global.fetch as jest.Mock).mockImplementation(() => mockFetchPromise);

    const resource = '/data';
    await expect(httpClient.get(resource)).rejects.toThrow(HttpRequestError);
    await expect(httpClient.get(resource)).rejects.toEqual(
      new HttpRequestError('Failed to fetch data', 404),
    );
  });

  it('should throw HttpRequestError on timeout', async () => {
    jest.useFakeTimers();

    (global.fetch as jest.Mock).mockImplementation(
      () =>
        // This promise rejects with a DOMException named AbortError after 10 seconds to simulate a timeout
        // https://developer.chrome.com/blog/abortable-fetch/#reacting_to_an_aborted_fetch
        new Promise((resolve, reject) =>
          setTimeout(
            () => reject(new DOMException('The operation was aborted.', 'AbortError')),
            10000,
          ),
        ),
    );

    const resource = '/data';
    const getPromise = httpClient.get(resource);

    // Immediately advance the timers by 10 seconds to simulate the timeout
    jest.advanceTimersByTime(10000);

    await expect(getPromise).rejects.toThrow(HttpRequestError);
    await expect(getPromise).rejects.toEqual(new HttpRequestError('Request timed out', 408));

    jest.useRealTimers();
  });
});
