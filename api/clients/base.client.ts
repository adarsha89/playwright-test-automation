import type { APIRequestContext } from '@playwright/test';
import { buildDefaultHeaders, buildPath, buildQuery, getApiBaseUrl } from '../helpers/request-builder.helper';
import { logger } from '../../utils/logger';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  pathParams?: Record<string, string | number>;
  query?: Record<string, string | number | boolean | undefined>;
  data?: unknown;
  headers?: Record<string, string>;
}

/**
 * Wraps Playwright's `APIRequestContext`. Holds the base URL + default
 * headers and exposes generic, typed `get`/`post`/`put`/`delete` methods.
 * Non-2xx responses throw an `ApiError` with the response body attached for
 * debugging. Resource clients (e.g. `UsersClient`) extend this and add
 * typed methods — no new auth or parsing logic per client.
 */
export class BaseClient {
  protected readonly baseUrl: string;

  constructor(
    protected readonly request: APIRequestContext,
    private readonly token?: string,
  ) {
    this.baseUrl = getApiBaseUrl();
  }

  protected async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options);
    const response = await this.request.get(url, { headers: this.buildHeaders(options.headers) });
    return this.parse<T>(response);
  }

  protected async post<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options);
    const response = await this.request.post(url, {
      headers: this.buildHeaders(options.headers),
      data: options.data,
    });
    return this.parse<T>(response);
  }

  protected async put<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options);
    const response = await this.request.put(url, {
      headers: this.buildHeaders(options.headers),
      data: options.data,
    });
    return this.parse<T>(response);
  }

  protected async delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.buildUrl(path, options);
    const response = await this.request.delete(url, { headers: this.buildHeaders(options.headers) });
    return this.parse<T>(response);
  }

  private buildUrl(path: string, options: RequestOptions): string {
    const resolvedPath = buildPath(path, options.pathParams);
    return `${this.baseUrl}${resolvedPath}${buildQuery(options.query)}`;
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    return { ...buildDefaultHeaders(this.token), ...extra };
  }

  private async parse<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
    const status = response.status();

    if (status < 200 || status >= 300) {
      const body = await this.safeReadBody(response);
      logger.error(`API request failed with status ${status}`, body);
      throw new ApiError(`Request failed with status ${status}`, status, body);
    }

    if (status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async safeReadBody(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return await response.text();
    }
  }
}
