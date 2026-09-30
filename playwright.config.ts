import { defineConfig, devices } from '@playwright/test';
import { env } from './config/env';
import { sharedBrowserProjects } from './fixtures/shared-browser/projects';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only (framework-guidelines principle g). */
  retries: process.env.CI ? 1 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 2 : undefined,
  /* HTML for local review, JUnit for the Jenkins JUnit plugin. */
  reporter: [['html'], ['junit', { outputFile: 'reports/junit-results.xml' }]],
  use: {
    baseURL: env.BASE_URL,
    /* Local runs have no retries, so keep traces for any failure there; on CI, record on the first retry. */
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    /* Headed locally for visibility; CI agents (Docker) have no display, so run headless there. */
    headless: !!process.env.CI,
  },

  /*
   * UI projects share ONE browser per engine: sharedBrowserProjects() adds one setup_<engine> dependency
   * (starts the engine's shared browser) and teardown_<engine> (stops it after the last project on it);
   * every test still gets a new context. Project names are free-form (e.g. 'smoke_chromium'); the engine
   * comes from `use`. See README "Execution model".
   */
  projects: [
    ...sharedBrowserProjects([
      { name: 'chromium', testMatch: 'ui/**/*.spec.ts', use: { ...devices['Desktop Chrome'] } },
      { name: 'firefox', testMatch: 'ui/**/*.spec.ts', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', testMatch: 'ui/**/*.spec.ts', use: { ...devices['Desktop Safari'] } },
      { name: 'new_webkit', testMatch: 'ui/**/*.spec.ts', use: { ...devices['Desktop Safari'] } },
    ]),
    {
      name: 'api',
      testMatch: 'api/**/*.spec.ts',
      use: {
        baseURL: env.API_BASE_URL,
      },
    },
  ],
});
