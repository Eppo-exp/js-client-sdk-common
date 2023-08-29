import { AxiosInstance } from 'axios';

interface ISdkParams {
  apiKey: string;
  sdkVersion: string;
  sdkName: string;
}

export class HttpRequestError extends Error {
  constructor(public message: string, public status: number) {
    super(message);
  }
}

export default class HttpClient {
  constructor(private axiosInstance: AxiosInstance, private sdkParams: ISdkParams) {}

  async get<T>(resource: string): Promise<T | undefined> {
    try {
      const response = await this.axiosInstance.get<T>(resource, {
        params: this.sdkParams,
      });
      return response.data;
    } catch (error) {
      this.handleHttpError(error);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleHttpError(error: any) {
    const status = error?.response?.status;
    throw new HttpRequestError(error.message, status);
  }
}
