import type { BrowserContext, Page } from '@playwright/test';
import { LEAK_PROBE_PATH, LEAK_PROBE_UNREACHABLE, LEAKED_BODY } from '../data/framework/shared-browser.data';
import { joinUrl } from './url';

/**
 * Browser-state helpers for the shared-browser isolation tests
 * (`tests/ui/framework/shared-browser.spec.ts`). No locators: the tests only
 * render a stub page they serve themselves via `context.route()`.
 *
 * The repo's `tsconfig.json` has no DOM lib, so code running inside
 * `page.evaluate` reaches browser globals through the structural
 * {@link BrowserGlobals} type instead of `window`/`any`.
 */

interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  setItem(key: string, value: string): void;
}

interface BrowserGlobals {
  localStorage: StorageLike;
  sessionStorage: StorageLike;
  navigator: { permissions: { query(descriptor: { name: string }): Promise<{ state: string }> } };
  fetch(input: string): Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
}

export interface BrowserStateSnapshot {
  cookieNames: string[];
  localStorageKeys: string[];
  sessionStorageKeys: string[];
  geolocationPermission: string;
}

const STUB_HTML = '<!doctype html><html><head><title>shared-browser probe</title></head><body></body></html>';

/**
 * Fulfils `origin` with a tiny HTML page. With `leakProbe`, also fulfils
 * `origin + LEAK_PROBE_PATH` with {@link LEAKED_BODY}; without it that path is
 * not routed at all (URL-predicate matching), so a request to it fails unless
 * a route leaked in from another test.
 */
export async function serveStubPage(
  context: BrowserContext,
  origin: string,
  options: { leakProbe?: boolean } = {},
): Promise<void> {
  const pageUrl = joinUrl(origin);
  await context.route(
    (url) => url.href === pageUrl,
    (route) => route.fulfill({ status: 200, contentType: 'text/html', body: STUB_HTML }),
  );
  if (options.leakProbe) {
    const leakUrl = joinUrl(origin, LEAK_PROBE_PATH);
    await context.route(
      (url) => url.href === leakUrl,
      (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: LEAKED_BODY }),
    );
  }
}

/** Writes `marker` as a cookie, a localStorage key and a sessionStorage key, and grants geolocation to `origin`. */
export async function writeMarkerState(
  context: BrowserContext,
  page: Page,
  origin: string,
  marker: string,
): Promise<void> {
  await context.addCookies([{ name: marker, value: marker, url: joinUrl(origin) }]);
  await page.evaluate((key) => {
    const g = globalThis as unknown as BrowserGlobals;
    g.localStorage.setItem(key, key);
    g.sessionStorage.setItem(key, key);
  }, marker);
  await context.grantPermissions(['geolocation'], { origin: new URL(origin).origin });
}

/** Snapshot of the cookie names, storage keys and geolocation permission visible to `page`. */
export async function readBrowserState(context: BrowserContext, page: Page): Promise<BrowserStateSnapshot> {
  const cookieNames = (await context.cookies()).map((cookie) => cookie.name).sort();
  const pageState = await page.evaluate(async () => {
    const g = globalThis as unknown as BrowserGlobals;
    const keysOf = (storage: StorageLike): string[] =>
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .filter((key): key is string => key !== null)
        .sort();
    const permission = await g.navigator.permissions.query({ name: 'geolocation' });
    return {
      localStorageKeys: keysOf(g.localStorage),
      sessionStorageKeys: keysOf(g.sessionStorage),
      geolocationPermission: permission.state,
    };
  });
  return { cookieNames, ...pageState };
}

/**
 * Fetches the leak-probe path from inside the page. Resolves to the response
 * body, or {@link LEAK_PROBE_UNREACHABLE} when the request fails (no route).
 */
export async function fetchLeakProbe(page: Page): Promise<string> {
  return page.evaluate(
    async ({ path, unreachable }) => {
      const g = globalThis as unknown as BrowserGlobals;
      try {
        const response = await g.fetch(path);
        return response.ok ? await response.text() : `HTTP ${response.status}`;
      } catch {
        return unreachable;
      }
    },
    { path: `/${LEAK_PROBE_PATH}`, unreachable: LEAK_PROBE_UNREACHABLE },
  );
}
