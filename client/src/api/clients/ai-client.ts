import { UrlBuilder } from '../utils/fetch-client.utils';

import type { AiJobCreated } from '../models/ai-job-created';
import type { AiJob } from '../models/ai-job';
import type { EntryKind } from '../models/entry-kind';
import type { FetchClientOptions, TypedResponse } from '../utils/fetch-client.utils';

export const AI_CLIENT_DEFAULT_OPTIONS: FetchClientOptions = {
  baseUrl: '/api',
};

export class AiClient {
  /**
   * Options for the fetch client.
   */
  public options: FetchClientOptions;

  constructor(options?: Partial<FetchClientOptions>) {
    this.options = { ...AI_CLIENT_DEFAULT_OPTIONS, ...options };
  }

  /**
   * @param body Body for the endpoint.
   */
  public createAiJob(body: {
      audio: Blob;
      kind: EntryKind;
      date?: string;
      title?: string;
    }): Promise<TypedResponse<AiJobCreated>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/ai/jobs')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<AiJobCreated>>;
  }

  /**
   * @param params Parameters for the endpoint.
   */
  public getAiJob(params: {
      jobId: string;
    }): Promise<TypedResponse<AiJob>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/ai/jobs/{jobId}')
      .withPathParam('jobId', params.jobId)
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<AiJob>>;
  }

  /**
   * @param params Parameters for the endpoint.
   */
  public cancelAiJob(params: {
      jobId: string;
    }): Promise<TypedResponse<void>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/ai/jobs/{jobId}')
      .withPathParam('jobId', params.jobId)
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
