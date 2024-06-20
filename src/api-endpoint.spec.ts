import ApiEndpoints from './api-endpoints';
import { BASE_URL as DEFAULT_BASE_URL } from './constants';

describe('ApiEndpoints', () => {
  it('should append query parameters to the URL', () => {
    const apiEndpoints = new ApiEndpoints({
      baseUrl: 'http://api.example.com',
      queryParams: {
        apiKey: '12345',
        sdkVersion: 'foobar',
        sdkName: 'ExampleSDK',
      },
    });
    expect(apiEndpoints.endpoint('/data').toString()).toEqual(
      'http://api.example.com/data?apiKey=12345&sdkVersion=foobar&sdkName=ExampleSDK',
    );
    expect(apiEndpoints.ufcEndpoint().toString()).toEqual(
      'http://api.example.com/flag-config/v1/config?apiKey=12345&sdkVersion=foobar&sdkName=ExampleSDK',
    );
  });

  it('should use default base URL if not provided', () => {
    const apiEndpoints = new ApiEndpoints({
      baseUrl: undefined,
      queryParams: {
        apiKey: '12345',
        sdkVersion: 'foobar',
        sdkName: 'ExampleSDK',
      },
    });
    expect(apiEndpoints.endpoint('/data').toString()).toEqual(
      `${DEFAULT_BASE_URL}/data?apiKey=12345&sdkVersion=foobar&sdkName=ExampleSDK`,
    );
    expect(apiEndpoints.ufcEndpoint().toString()).toEqual(
      `${DEFAULT_BASE_URL}/flag-config/v1/config?apiKey=12345&sdkVersion=foobar&sdkName=ExampleSDK`,
    );
  });
});
