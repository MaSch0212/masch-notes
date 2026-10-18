import { UrlBuilder } from '../utils/fetch-client.utils';

import type { ApiKeyInput } from '../models/api-key-input';
import type { ApiKey } from '../models/api-key';
import type { CreatedApiKey } from '../models/created-api-key';
import type { FetchClientOptions, TypedResponse } from '../utils/fetch-client.utils';

export const API_KEYS_CLIENT_DEFAULT_OPTIONS: FetchClientOptions = {
  baseUrl: '/api',
};

export class ApiKeysClient {
  /**
   * Options for the fetch client.
   */
  public options: FetchClientOptions;

  constructor(options?: Partial<FetchClientOptions>) {
    this.options = { ...API_KEYS_CLIENT_DEFAULT_OPTIONS, ...options };
  }

  public listApiKeys(): Promise<TypedResponse<(ApiKey)[]>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/api-keys')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<(ApiKey)[]>>;
  }

  /**
   * @param body Body for the endpoint.
   */
  public createApiKey(body: ApiKeyInput): Promise<TypedResponse<CreatedApiKey>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/api-keys')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<CreatedApiKey>>;
  }

  /**
   * @param params Parameters for the endpoint.
   */
  public deleteApiKey(params: {
      keyId: number;
    }): Promise<TypedResponse<void>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/api-keys/{keyId}')
      .withPathParam('keyId', params.keyId)
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'DELETE',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: true });
    return response as unknown as Promise<TypedResponse<void>>;
  }
}
