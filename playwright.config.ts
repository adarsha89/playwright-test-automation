import { defineConfig, devices } from '@playwright/test';
import { env } from './config/env';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only (framework-guidelines principle g). */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* HTML for local review, JUnit for the Jenkins JUnit plugin. */
  reporter: [['html'], ['junit', { outputFile: 'reports/junit-results.xml' }]],
  use: {
    baseURL: env.BASE_URL,
    trace: 'on',//'on-first-retry',
    video: 'on',//'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: false
  },

  projects: [
    {
      name: 'chromium',
      testMatch: 'ui/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testMatch: 'ui/**/*.spec.ts',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testMatch: 'ui/**/*.spec.ts',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'api',
      testMatch: 'api/**/*.spec.ts',
      use: {
        baseURL: env.API_BASE_URL,
      },
    },
  ],
});
