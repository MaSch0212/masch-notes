import { UrlBuilder } from '../utils/fetch-client.utils';

import type { AppConfig } from '../models/app-config';
import type { ChangePasswordRequest } from '../models/change-password-request';
import type { LoginRequest } from '../models/login-request';
import type { LoginResponse } from '../models/login-response';
import type { PreloginRequest } from '../models/prelogin-request';
import type { PreloginResponse } from '../models/prelogin-response';
import type { RegisterRequest } from '../models/register-request';
import type { FetchClientOptions, TypedResponse } from '../utils/fetch-client.utils';

export const AUTH_CLIENT_DEFAULT_OPTIONS: FetchClientOptions = {
  baseUrl: '/api',
};

export class AuthClient {
  /**
   * Options for the fetch client.
   */
  public options: FetchClientOptions;

  constructor(options?: Partial<FetchClientOptions>) {
    this.options = { ...AUTH_CLIENT_DEFAULT_OPTIONS, ...options };
  }

  public getConfig(): Promise<TypedResponse<AppConfig>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/config')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<AppConfig>>;
  }

  /**
   * @param body Body for the endpoint.
   */
  public prelogin(body: PreloginRequest): Promise<TypedResponse<PreloginResponse>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/auth/prelogin')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<PreloginResponse>>;
  }

  /**
   * @param body Body for the endpoint.
   */
  public login(body: LoginRequest): Promise<TypedResponse<LoginResponse>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/auth/login')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<LoginResponse>>;
  }

  /**
   * @param body Body for the endpoint.
   */
  public register(body: RegisterRequest): Promise<TypedResponse<LoginResponse>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/auth/register')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<LoginResponse>>;
  }

  public checkToken(): Promise<TypedResponse<void>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/auth/check')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: true });
    return response as unknown as Promise<TypedResponse<void>>;
  }

  /**
   * @param body Body for the endpoint.
   */
  public changePassword(body: ChangePasswordRequest): Promise<TypedResponse<void>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/auth/password')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });
    Object.defineProperty(response, 'isVoidResponse', { value: true });
    return response as unknown as Promise<TypedResponse<void>>;
  }
}
