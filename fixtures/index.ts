import { test as base, type Page } from '@playwright/test';
import { env, isPlaywrightDebugMode } from '../config/env';
import { AuthHelper } from '../api/helpers/auth.helper';
import { UsersClient, type CreateUserPayload } from '../api/clients/example.client';
import { buildUserPayload, buildLoginCredentials, type LoginCredentials } from '../data/builders/example.builder';
import { LoginPage } from '../pages/saucedemo/login.page';
import { SAUCEDEMO_USERS } from '../data/saucedemo/saucedemo-users.data';
import { joinUrl } from '../utils/url';
import { logger } from '../utils/logger';
import {
  readReadySharedBrowser,
  SharedBrowserError,
  SHARED_BROWSER_CONNECT_TIMEOUT_MS,
  toSharedBrowserName,
  waitForSharedBrowserVerdict,
} from './shared-browser/client';
import { registerWorkerAttachment } from './shared-browser/state';
import type { ReadySharedBrowserState } from './shared-browser/types';

/** Playwright's messages when a test's browser went away underneath it. */
const BROWSER_CLOSED_ERROR = /browser has been closed|Browser closed|Target .*closed/i;

/** The attributable message for a shared browser that is no longer usable. */
function sharedBrowserFailureMessage(sharedBrowser: ReadySharedBrowserState, verdict: string): string {
  try {
    readReadySharedBrowser(sharedBrowser.key, sharedBrowser.browserName);
  } catch (error) {
    if (error instanceof SharedBrowserError) {
      return error.message;
    }
  }
  return `Shared ${sharedBrowser.browserName} browser "${sharedBrowser.key}" (server pid ${sharedBrowser.serverPid}) is ${verdict}`;
}

interface TestData {
  user: CreateUserPayload;
  loginCredentials: LoginCredentials;
}

interface TestFixtures {
  /** A page that has already logged in through the UI, ready to use. */
  authenticatedPage: Page;
  /** Typed API client for the example "users" resource, pre-wired with auth. */
  exampleClient: UsersClient;
  /** Faker-backed synthetic test data — specs never inline raw literals. */
  testData: TestData;
  /** A page already logged into SauceDemo as `standard_user`, ready to use. */
  sauceDemoAuthenticatedPage: Page;
}

interface WorkerFixtures {
  /** Authenticates once per worker and caches the bearer token. */
  authToken: string;
  /**
   * This worker's view of its engine's single shared browser, read from the
   * state file written by `setup_<engine>` (see the execution-model note on
   * `test`). `null` only under `--debug`/`PWDEBUG`, where each worker launches
   * its own browser for Inspector compatibility.
   */
  sharedBrowser: ReadySharedBrowserState | null;
}

/**
 * All custom fixtures are declared once here and imported by every spec
 * (`import { test, expect } from '../../fixtures'`) — no per-file
 * `beforeEach` duplication (framework-guidelines principle b).
 *
 * Execution model (README "Execution model"): each browser engine (chromium,
 * firefox, webkit) runs ONE shared browser per test run/shard, shared by every UI
 * project on it. The `setup_<engine>` dependency project starts it as a detached,
 * loopback-only browser server and `teardown_<engine>` stops it after the last of
 * those projects (`fixtures/shared-browser/`); there is no global setup. Every
 * worker of those projects connects to it through
 * the overridden `connectOptions`. Every test still gets a brand-new
 * `BrowserContext` and `Page` from Playwright's built-in `context`/`page`
 * fixtures, closed when the test ends. Specs that import `@playwright/test`
 * directly bypass this and use a per-worker browser.
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Lazy: only instantiated through `connectOptions` -> `browser`, i.e. by tests that use a browser.
  sharedBrowser: [
    async ({ browserName }, use, workerInfo) => {
      if (isPlaywrightDebugMode()) {
        logger.info(
          '[shared-browser] --debug/PWDEBUG detected: using a per-worker browser for Inspector compatibility',
        );
        await use(null);
        return;
      }
      const engine = toSharedBrowserName(browserName);
      const state = readReadySharedBrowser(engine, engine);
      registerWorkerAttachment(engine, workerInfo.workerIndex, process.pid);
      await use(state);
    },
    { scope: 'worker' },
  ],

  // Overrides Playwright's option fixture, so the built-in `browser` fixture connects to the
  // shared browser instead of launching its own. `browser`/`context`/`page` themselves stay built-in.
  connectOptions: [
    async ({ sharedBrowser }, use) => {
      await use(
        sharedBrowser
          ? { wsEndpoint: sharedBrowser.wsEndpoint, timeout: SHARED_BROWSER_CONNECT_TIMEOUT_MS }
          : undefined,
      );
    },
    { scope: 'worker' },
  ],

  // After a test that failed because the browser closed, attribute the failure to the shared
  // browser when it crashed or its server is gone. Ordinary failures skip this entirely.
  context: async ({ context, sharedBrowser, browser }, use, testInfo) => {
    await use(context);
    const browserClosed = testInfo.errors.some((error) => BROWSER_CLOSED_ERROR.test(error.message ?? ''));
    if (!sharedBrowser || testInfo.status === testInfo.expectedStatus || !browserClosed) {
      return;
    }
    let attribution: string | undefined;
    try {
      const verdict = await waitForSharedBrowserVerdict(browser, sharedBrowser.key);
      attribution = verdict === 'ready' ? undefined : sharedBrowserFailureMessage(sharedBrowser, verdict);
    } catch (error) {
      logger.warn('[shared-browser] could not check the shared browser after a failed test', error);
    }
    if (attribution !== undefined) {
      throw new SharedBrowserError(`${attribution} during this test`);
    }
  },

  authToken: [
    async ({ playwright }, use) => {
      const requestContext = await playwright.request.newContext();
      const authHelper = new AuthHelper(requestContext);
      const token = await authHelper.getAuthToken();
      await use(token);
      await requestContext.dispose();
    },
    { scope: 'worker' },
  ],

  exampleClient: async ({ request, authToken }, use) => {
    const client = new UsersClient(request, authToken);
    await use(client);
  },

  authenticatedPage: async ({ page }, use) => {
    await page.goto(joinUrl(env.BASE_URL, 'login'));
    await page.getByLabel('Email').fill(env.TEST_USER_EMAIL);
    await page.getByLabel('Password').fill(env.TEST_USER_PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await use(page);
  },

  testData: async ({}, use) => {
    await use({
      user: buildUserPayload(),
      loginCredentials: buildLoginCredentials(),
    });
  },

  sauceDemoAuthenticatedPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.login(SAUCEDEMO_USERS.standard.username, SAUCEDEMO_USERS.standard.password);
    await page.waitForURL(joinUrl(env.SAUCEDEMO_BASE_URL, 'inventory.html'));
    await use(page);
  },
});

export { expect } from '@playwright/test';
export { SharedBrowserError } from './shared-browser/client';
export type { ReadySharedBrowserState } from './shared-browser/types';
