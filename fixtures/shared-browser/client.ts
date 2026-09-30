import fs from 'node:fs';
import type { Browser } from '@playwright/test';
import { SharedBrowserError } from './errors';
import { setupProjectName } from './projects';
import { isProcessAlive, readSharedBrowserState, runDir } from './state';
import { sharedBrowserNameSchema, type ReadySharedBrowserState, type SharedBrowserName } from './types';

/**
 * Worker-side readers of the engine's shared browser (see
 * `docs/plans/shared-browser-per-project-plan.md` §6.4). Workers only read the
 * state file written by `browser-server.mjs`; they never start or stop it.
 */

export { SharedBrowserError } from './errors';

/** Passed to Playwright's built-in `browser` fixture as `connectOptions.timeout`. */
export const SHARED_BROWSER_CONNECT_TIMEOUT_MS = 30_000;

/**
 * Upper bound for {@link waitForSharedBrowserVerdict}. Only paid by a failed test
 * whose error says the browser closed (plan P-3a: the crash verdict lands within ms).
 */
export const SHARED_BROWSER_VERDICT_TIMEOUT_MS = 5_000;

/** Narrows a Playwright `browserName` to one the shared browser supports, or throws a clear error. */
export function toSharedBrowserName(browserName: string): SharedBrowserName {
  const parsed = sharedBrowserNameSchema.safeParse(browserName);
  if (!parsed.success) {
    throw new SharedBrowserError(
      `Unsupported browserName "${browserName}": the shared browser supports chromium, firefox and webkit only`,
    );
  }
  return parsed.data;
}

/**
 * Shared browser `key` (the engine), ready to connect to. Throws
 * {@link SharedBrowserError} naming the key and setup project (and pid where known)
 * when setup did not run, the launch failed, the browser crashed or its server
 * is gone.
 */
export function readReadySharedBrowser(key: string, browserName: SharedBrowserName): ReadySharedBrowserState {
  const state = readSharedBrowserState(key);
  if (state === undefined) {
    throw new SharedBrowserError(
      `No shared browser "${key}" in this run: did ${setupProjectName(key)} run? (it is skipped by --no-deps)`,
    );
  }
  if (state.status === 'failed') {
    throw new SharedBrowserError(`Shared ${state.browserName} browser "${key}" failed to start: ${state.error}`);
  }
  if (state.status === 'crashed') {
    throw new SharedBrowserError(
      `Shared ${state.browserName} browser "${key}" (server pid ${state.serverPid}) is crashed: ${state.error}`,
    );
  }
  if (!isProcessAlive(state.serverPid)) {
    throw new SharedBrowserError(
      `Shared ${state.browserName} browser "${key}" (server pid ${state.serverPid}) is no longer running`,
    );
  }
  if (state.browserName !== browserName) {
    throw new SharedBrowserError(
      `Shared browser "${key}": state is for ${state.browserName}, project uses ${browserName}`,
    );
  }
  return state;
}

export type SharedBrowserVerdict = 'ready' | 'crashed' | 'failed' | 'gone' | 'disconnected';

function verdictFromState(key: string): SharedBrowserVerdict {
  try {
    return readSharedBrowserState(key)?.status ?? 'gone';
  } catch {
    // A malformed file says nothing about the browser; keep waiting for a clear verdict.
    return 'ready';
  }
}

/**
 * Resolves as soon as shared browser `key`'s state leaves `ready` (`crashed`/`failed`)
 * or the state file disappears (`gone`). A `disconnected` event on `browser`
 * triggers an immediate re-check; if the server has not written its verdict
 * yet, waiting continues, and `disconnected` is returned at the timeout.
 * Resolves `ready` on timeout otherwise.
 *
 * Needed because right after a crash `browser.isConnected()` is still `true`
 * and the state still `ready` for a few ms (plan P-3a). Event-driven
 * (`fs.watch` + `disconnected`), bounded by one timeout; no polling sleeps.
 */
export async function waitForSharedBrowserVerdict(
  browser: Browser,
  key: string,
  timeoutMs: number = SHARED_BROWSER_VERDICT_TIMEOUT_MS,
): Promise<SharedBrowserVerdict> {
  const initial = verdictFromState(key);
  if (initial !== 'ready') {
    return initial;
  }
  return new Promise<SharedBrowserVerdict>((resolve) => {
    let settled = false;
    let disconnected = !browser.isConnected();
    let watcher: fs.FSWatcher | undefined;
    const finish = (verdict: SharedBrowserVerdict): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      watcher?.close();
      browser.off('disconnected', onDisconnected);
      resolve(verdict);
    };
    const check = (): void => {
      const verdict = verdictFromState(key);
      if (verdict !== 'ready') {
        finish(verdict);
      }
    };
    const onDisconnected = (): void => {
      disconnected = true;
      check();
    };
    const timer = setTimeout(() => finish(disconnected ? 'disconnected' : 'ready'), timeoutMs);
    browser.once('disconnected', onDisconnected);
    try {
      watcher = fs.watch(runDir(), check);
    } catch {
      finish('gone');
      return;
    }
    // The state may have changed between the first read and the watcher registration.
    check();
  });
}
