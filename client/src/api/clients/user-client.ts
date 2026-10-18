import { UrlBuilder } from '../utils/fetch-client.utils';

import type { UpdateUserRequest } from '../models/update-user-request';
import type { User } from '../models/user';
import type { FetchClientOptions, TypedResponse } from '../utils/fetch-client.utils';

export const USER_CLIENT_DEFAULT_OPTIONS: FetchClientOptions = {
  baseUrl: '/api',
};

export class UserClient {
  /**
   * Options for the fetch client.
   */
  public options: FetchClientOptions;

  constructor(options?: Partial<FetchClientOptions>) {
    this.options = { ...USER_CLIENT_DEFAULT_OPTIONS, ...options };
  }

  public getUser(): Promise<TypedResponse<User>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/user')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<User>>;
  }

  /**
   * @param body Body for the endpoint.
   */
  public updateUser(body: UpdateUserRequest): Promise<TypedResponse<User>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/user')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(body),
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<User>>;
  }
}
