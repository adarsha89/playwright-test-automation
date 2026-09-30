import { test, expect, SharedBrowserError } from '../../../fixtures';
import {
  readReadySharedBrowser,
  toSharedBrowserName,
  waitForSharedBrowserVerdict,
} from '../../../fixtures/shared-browser/client';
import {
  SHARED_BROWSER_START_TIMEOUT_MS,
  startSharedBrowserServer,
  stopSharedBrowserServer,
} from '../../../fixtures/shared-browser/lifecycle';
import {
  currentRunnerPid,
  isProcessAlive,
  readSharedBrowserState,
  removeSharedBrowserFiles,
  writeSharedBrowserState,
} from '../../../fixtures/shared-browser/state';
import {
  CRASHED_BROWSER_ERROR,
  FAKE_DEAD_SERVER_PID,
  NONEXISTENT_BROWSER_EXECUTABLE,
  PRIVATE_CRASH_PREFIX,
  PRIVATE_LAUNCH_FAILURE_PREFIX,
  PRIVATE_MISSING_PREFIX,
} from '../../../data/framework/shared-browser.data';

/**
 * Error-path checks for the shared-browser execution model
 * (docs/plans/shared-browser-per-project-plan.md §5, TC-5 to TC-7). Each test
 * works on a private state key suffixed with its engine, so it never touches
 * the project's real shared browser, and none of them opens a page. TC-5
 * spawns a real server whose launch fails; no browser is ever started.
 */

test.describe('Shared browser error reporting', () => {
  test(
    'reports a shared browser that cannot start as a failed setup with its cause',
    { tag: ['@regression', '@framework', '@shared-browser-launch-failure-reported'] },
    async ({ browserName }) => {
      test.setTimeout(SHARED_BROWSER_START_TIMEOUT_MS + 15_000);
      const engine = toSharedBrowserName(browserName);
      const privateKey = `${PRIVATE_LAUNCH_FAILURE_PREFIX}${engine}`;
      try {
        const start = startSharedBrowserServer({
          key: privateKey,
          browserName: engine,
          launchOptions: { headless: true, executablePath: NONEXISTENT_BROWSER_EXECUTABLE },
        });

        await expect(start).rejects.toBeInstanceOf(SharedBrowserError);
        await expect(start).rejects.toThrow(
          new RegExp(
            `^\\[shared-browser\\] setup_${privateKey}: could not start the shared ${engine} browser: [\\s\\S]*doesn't exist`,
          ),
        );
        const failedState = readSharedBrowserState(privateKey);
        expect(failedState).toMatchObject({ status: 'failed', key: privateKey, browserName: engine });
        expect(failedState && isProcessAlive(failedState.serverPid)).toBe(false);
      } finally {
        await stopSharedBrowserServer(privateKey);
      }
      expect(readSharedBrowserState(privateKey)).toBeUndefined();
    },
  );

  test(
    'reports a crashed shared browser with the project, engine and server pid',
    { tag: ['@regression', '@framework', '@shared-browser-crash-reported'] },
    async ({ browserName, browser }) => {
      const engine = toSharedBrowserName(browserName);
      const privateKey = `${PRIVATE_CRASH_PREFIX}${engine}`;
      try {
        writeSharedBrowserState({
          status: 'crashed',
          key: privateKey,
          browserName: engine,
          serverPid: FAKE_DEAD_SERVER_PID,
          runnerPid: currentRunnerPid(),
          error: `${engine} ${CRASHED_BROWSER_ERROR}`,
        });

        expect(() => readReadySharedBrowser(privateKey, engine)).toThrow(SharedBrowserError);
        expect(() => readReadySharedBrowser(privateKey, engine)).toThrow(
          new RegExp(
            `shared ${engine} browser "${privateKey}" \\(server pid ${FAKE_DEAD_SERVER_PID}\\) is crashed: .*exited unexpectedly`,
            'i',
          ),
        );
        expect(await waitForSharedBrowserVerdict(browser, privateKey)).toBe('crashed');
      } finally {
        removeSharedBrowserFiles(privateKey);
      }
    },
  );

  test(
    'reports a missing shared browser and points at the setup project',
    { tag: ['@regression', '@framework', '@shared-browser-missing-state-reported'] },
    async ({ browserName }) => {
      const engine = toSharedBrowserName(browserName);
      const privateKey = `${PRIVATE_MISSING_PREFIX}${engine}`;
      try {
        expect(() => readReadySharedBrowser(privateKey, engine)).toThrow(SharedBrowserError);
        expect(() => readReadySharedBrowser(privateKey, engine)).toThrow(`did setup_${privateKey} run?`);
      } finally {
        removeSharedBrowserFiles(privateKey);
      }
    },
  );
});
