import { UrlBuilder } from '../utils/fetch-client.utils';

import type { EntryInput } from '../models/entry-input';
import type { MonthCount } from '../models/month-count';
import type { NotebookEntry } from '../models/notebook-entry';
import type { NotebookInput } from '../models/notebook-input';
import type { Notebook } from '../models/notebook';
import type { RenameNotebookRequest } from '../models/rename-notebook-request';
import type { FetchClientOptions, TypedResponse } from '../utils/fetch-client.utils';

export const NOTEBOOKS_CLIENT_DEFAULT_OPTIONS: FetchClientOptions = {
  baseUrl: '/api',
};

export class NotebooksClient {
  /**
   * Options for the fetch client.
   */
  public options: FetchClientOptions;

  constructor(options?: Partial<FetchClientOptions>) {
    this.options = { ...NOTEBOOKS_CLIENT_DEFAULT_OPTIONS, ...options };
  }

  public listNotebooks(): Promise<TypedResponse<(Notebook)[]>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/notebooks')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<(Notebook)[]>>;
  }

  /**
   * @param body Body for the endpoint.
   */
  public createNotebook(body: NotebookInput): Promise<TypedResponse<Notebook>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/notebooks')
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<Notebook>>;
  }

  /**
   * @param params Parameters for the endpoint.
   */
  public getNotebook(params: {
      notebookId: number;
    }): Promise<TypedResponse<Notebook>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/notebooks/{notebookId}')
      .withPathParam('notebookId', params.notebookId)
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<Notebook>>;
  }

  /**
   * @param params Parameters for the endpoint.
   * @param body Body for the endpoint.
   */
  public renameNotebook(params: {
      notebookId: number;
    }, body: RenameNotebookRequest): Promise<TypedResponse<Notebook>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/notebooks/{notebookId}')
      .withPathParam('notebookId', params.notebookId)
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(body),
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<Notebook>>;
  }

  /**
   * @param params Parameters for the endpoint.
   */
  public deleteNotebook(params: {
      notebookId: number;
    }): Promise<TypedResponse<void>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/notebooks/{notebookId}')
      .withPathParam('notebookId', params.notebookId)
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'DELETE',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: true });
    return response as unknown as Promise<TypedResponse<void>>;
  }

  /**
   * @param params Parameters for the endpoint.
   */
  public listEntries(params: {
      notebookId: number;
      from?: string;
      to?: string;
      includeContent?: boolean;
    }): Promise<TypedResponse<(NotebookEntry)[]>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/notebooks/{notebookId}/entries')
      .withPathParam('notebookId', params.notebookId)
      .withQueryParam('from', params.from)
      .withQueryParam('to', params.to)
      .withQueryParam('includeContent', params.includeContent)
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<(NotebookEntry)[]>>;
  }

  /**
   * @param params Parameters for the endpoint.
   * @param body Body for the endpoint.
   */
  public createEntry(params: {
      notebookId: number;
    }, body: EntryInput): Promise<TypedResponse<NotebookEntry>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/notebooks/{notebookId}/entries')
      .withPathParam('notebookId', params.notebookId)
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<NotebookEntry>>;
  }

  /**
   * @param params Parameters for the endpoint.
   */
  public getEntry(params: {
      notebookId: number;
      entryId: number;
    }): Promise<TypedResponse<NotebookEntry>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/notebooks/{notebookId}/entries/{entryId}')
      .withPathParam('notebookId', params.notebookId)
      .withPathParam('entryId', params.entryId)
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<NotebookEntry>>;
  }

  /**
   * @param params Parameters for the endpoint.
   * @param body Body for the endpoint.
   */
  public updateEntry(params: {
      notebookId: number;
      entryId: number;
    }, body: EntryInput): Promise<TypedResponse<NotebookEntry>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/notebooks/{notebookId}/entries/{entryId}')
      .withPathParam('notebookId', params.notebookId)
      .withPathParam('entryId', params.entryId)
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(body),
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<NotebookEntry>>;
  }

  /**
   * @param params Parameters for the endpoint.
   */
  public deleteEntry(params: {
      notebookId: number;
      entryId: number;
    }): Promise<TypedResponse<void>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/notebooks/{notebookId}/entries/{entryId}')
      .withPathParam('notebookId', params.notebookId)
      .withPathParam('entryId', params.entryId)
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'DELETE',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: true });
    return response as unknown as Promise<TypedResponse<void>>;
  }

  /**
   * @param params Parameters for the endpoint.
   */
  public listMonthCounts(params: {
      notebookId: number;
    }): Promise<TypedResponse<(MonthCount)[]>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/notebooks/{notebookId}/month-counts')
      .withPathParam('notebookId', params.notebookId)
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<(MonthCount)[]>>;
  }

  /**
   * @param params Parameters for the endpoint.
   */
  public listCategories(params: {
      notebookId: number;
    }): Promise<TypedResponse<(string)[]>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/notebooks/{notebookId}/categories')
      .withPathParam('notebookId', params.notebookId)
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<(string)[]>>;
  }
}
