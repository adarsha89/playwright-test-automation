import type { Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Cross-cutting network-assertion helper — not page-object-owned
 * locator/action behavior, so it lives here rather than on a page object
 * (see `utils/logger.ts` for the same pattern of a cross-cutting concern
 * sitting outside the POM layer).
 *
 * Validated live against `https://www.saucedemo.com/` in
 * `docs/exploration/saucedemo-network-interception-codegen.ts`: on both
 * login-page load and add-to-cart click, the app fires a pair of calls to
 * Backtrace.io (a third-party error/event-tracking SaaS embedded in the
 * app), which deterministically respond `401` with a fixed JSON error body
 * because the site ships literal `UNIVERSE`/`TOKEN` placeholder query
 * values. This is real, unmocked, third-party traffic — there is no
 * business-logic backend call on this site to intercept/mock.
 */

/** Matches `POST https://events.backtrace.io/api/unique-events/submit?...` */
export const UNIQUE_EVENTS_URL_PATTERN = /events\.backtrace\.io\/api\/unique-events\/submit/;
/** Matches `POST https://events.backtrace.io/api/summed-events/submit?...` */
export const SUMMED_EVENTS_URL_PATTERN = /events\.backtrace\.io\/api\/summed-events\/submit/;

/** Shared source of truth for the expected response body from both endpoints. */
export const EXPECTED_BACKTRACE_ERROR_BODY = {
  error: {
    message: 'Unauthorized request',
    code: 6,
  },
};

const RESPONSE_WAIT_TIMEOUT_MS = 10_000;

async function assertBacktraceEventResponse(response: Response): Promise<void> {
  expect(response.status()).toBe(401);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(await response.json()).toEqual(EXPECTED_BACKTRACE_ERROR_BODY);
}

/**
 * Observes the `events.backtrace.io` `unique-events`/`summed-events` submit
 * beacon pair triggered by `trigger()`, and asserts each response's status,
 * content-type, and JSON body.
 *
 * Uses `Promise.all([...waitForResponse, trigger()])` (rather than a bare
 * sequential `await page.waitForResponse()` after the triggering action) so
 * both listeners are registered before `trigger()` runs, avoiding the race
 * where a fast beacon response arrives before `waitForResponse()` has
 * finished registering. The two waits are independent, URL-keyed promises
 * raced together — order-independent by construction. A bounded timeout
 * ensures this fails clearly (not hangs) if a call never arrives.
 */
export async function assertBacktraceEventsBeaconPair(page: Page, trigger: () => Promise<void>): Promise<void> {
  const [uniqueEventsResponse, summedEventsResponse] = await Promise.all([
    page.waitForResponse((response) => UNIQUE_EVENTS_URL_PATTERN.test(response.url()), {
      timeout: RESPONSE_WAIT_TIMEOUT_MS,
    }),
    page.waitForResponse((response) => SUMMED_EVENTS_URL_PATTERN.test(response.url()), {
      timeout: RESPONSE_WAIT_TIMEOUT_MS,
    }),
    trigger(),
  ]);

  await assertBacktraceEventResponse(uniqueEventsResponse);
  await assertBacktraceEventResponse(summedEventsResponse);
}
