import ApiEndpoints from './api-endpoints';

describe('ApiEndpoints', () => {
  it('should append query parameters to the URL', () => {
    const apiEndpoints = new ApiEndpoints('http://api.example.com', {
      apiKey: '12345',
      sdkVersion: 'foobar',
      sdkName: 'ExampleSDK',
    });
    expect(apiEndpoints.endpoint('/data').toString()).toEqual(
      'http://api.example.com/data?apiKey=12345&sdkVersion=foobar&sdkName=ExampleSDK',
    );
    expect(apiEndpoints.ufcEndpoint().toString()).toEqual(
      'http://api.example.com/flag-config/v1/config?apiKey=12345&sdkVersion=foobar&sdkName=ExampleSDK',
    );
  });
});
