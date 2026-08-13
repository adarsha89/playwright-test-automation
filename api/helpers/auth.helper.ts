import type { APIRequestContext } from '@playwright/test';
import { env } from '../../config/env';
import { getApiBaseUrl } from './request-builder.helper';
import { logger } from '../../utils/logger';

interface AuthTokenResponse {
  token: string;
}

/**
 * Authenticates once and caches the resulting token for the lifetime of the
 * module (i.e. once per worker process, since Playwright workers are
 * separate processes). Wired in as a worker-scoped fixture in
 * `fixtures/index.ts` — no spec calls this directly or logs in by hand.
 */
export class AuthHelper {
  private cachedToken: string | undefined;

  constructor(private readonly request: APIRequestContext) {}

  async getAuthToken(): Promise<string> {
    if (this.cachedToken) {
      return this.cachedToken;
    }

    logger.info('Authenticating API user for worker session');

    const response = await this.request.post(`${getApiBaseUrl()}/auth/login`, {
      data: {
        username: env.API_AUTH_USERNAME,
        password: env.API_AUTH_PASSWORD,
      },
    });

    if (!response.ok()) {
      throw new Error(`Failed to authenticate API user: ${response.status()} ${await response.text()}`);
    }

    const body = (await response.json()) as AuthTokenResponse;
    this.cachedToken = body.token;
    return this.cachedToken;
  }
}
