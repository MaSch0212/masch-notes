import { UrlBuilder } from '../utils/fetch-client.utils';

import type { DayRating } from '../models/day-rating';
import type { RatingInput } from '../models/rating-input';
import type { FetchClientOptions, TypedResponse } from '../utils/fetch-client.utils';

export const DAY_RATINGS_CLIENT_DEFAULT_OPTIONS: FetchClientOptions = {
  baseUrl: '/api',
};

export class DayRatingsClient {
  /**
   * Options for the fetch client.
   */
  public options: FetchClientOptions;

  constructor(options?: Partial<FetchClientOptions>) {
    this.options = { ...DAY_RATINGS_CLIENT_DEFAULT_OPTIONS, ...options };
  }

  /**
   * @param params Parameters for the endpoint.
   */
  public listRatings(params: {
      from: string;
      to: string;
    }): Promise<TypedResponse<(DayRating)[]>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/day-ratings')
      .withQueryParam('from', params.from)
      .withQueryParam('to', params.to)
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'GET',
      headers: headers,
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<(DayRating)[]>>;
  }

  /**
   * @param params Parameters for the endpoint.
   * @param body Body for the endpoint.
   */
  public setRating(params: {
      date: string;
    }, body: RatingInput): Promise<TypedResponse<DayRating>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/day-ratings/{date}')
      .withPathParam('date', params.date)
      .build();
    const headers = { ...this.options.headers };
    const response = (this.options.fetch ?? fetch)(url, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(body),
    });
    Object.defineProperty(response, 'isVoidResponse', { value: false });
    return response as unknown as Promise<TypedResponse<DayRating>>;
  }

  /**
   * @param params Parameters for the endpoint.
   */
  public clearRating(params: {
      date: string;
    }): Promise<TypedResponse<void>> {
    const url = new UrlBuilder(this.options.baseUrl)
      .withPath('/day-ratings/{date}')
      .withPathParam('date', params.date)
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
