import { UrlBuilder } from '../utils/fetch-client.utils';

import type { MigratedEntry } from '../models/migrated-entry';
import type { MigrationInfo } from '../models/migration-info';
import type { PendingEntry } from '../models/pending-entry';
import type { SkipEntriesRequest } from '../models/skip-entries-request';
import type { StartMigrationRequest } from '../models/start-migration-request';
import type { FetchClientOptions, TypedResponse } from '../utils/fetch-client.utils';

export const CRYPTO_CLIENT_DEFAULT_OPTIONS: FetchClientOptions = {
  baseUrl: '/api',
};

export class CryptoClient {
  /**
   * Options for the fetch client.
   */
  public options: FetchClientOptions;

  constructor(options?: Partial<FetchClientOptions>) {
    this.options = { ...CRYPTO_CLIENT_DEFAULT_OPTIONS, ...options };
  }

  public getMigration(): Promise<TypedResponse<MigrationInfo>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/crypto/migration')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<MigrationInfo>>;
  }

  /**
   * @param body Body for the endpoint.
   */
  public startMigration(body: StartMigrationRequest): Promise<TypedResponse<MigrationInfo>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/crypto/migration/start')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<MigrationInfo>>;
  }

  /**
   * @param params Parameters for the endpoint.
   */
  public listPendingEntries(params: {
      limit?: number;
    }): Promise<TypedResponse<(PendingEntry)[]>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/crypto/migration/pending')
      .withQueryParam('limit', params.limit)
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<(PendingEntry)[]>>;
  }

  /**
   * @param body Body for the endpoint.
   */
  public uploadMigratedEntries(body: (MigratedEntry)[]): Promise<TypedResponse<void>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/crypto/migration/entries')
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

  /**
   * @param body Body for the endpoint.
   */
  public skipEntries(body: SkipEntriesRequest): Promise<TypedResponse<void>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/crypto/migration/skip')
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

  public completeMigration(): Promise<TypedResponse<void>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/crypto/migration/complete')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'POST',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: true });
    return response as unknown as Promise<TypedResponse<void>>;
  }
}
