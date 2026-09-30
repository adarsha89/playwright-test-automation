import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../utils/logger';
import { SharedBrowserError } from './errors';
import { setupProjectName } from './projects';
import {
  currentRunnerPid,
  ensureRunDir,
  isProcessAlive,
  listAttachedWorkers,
  readSharedBrowserState,
  removeSharedBrowserFiles,
  removeStaleRunDirs,
  runDir,
  serverLogPath,
  statePath,
} from './state';
import {
  sharedBrowserServerArgsSchema,
  type ReadySharedBrowserState,
  type SharedBrowserLaunchOptions,
  type SharedBrowserName,
  type SharedBrowserState,
} from './types';

/**
 * Start/stop of an engine's detached shared-browser server
 * (`docs/plans/shared-browser-per-project-plan.md` §6.5). Used only by the
 * `setup_<engine>` / `teardown_<engine>` project tests and the launch-failure
 * verification test, so their bodies stay a single call plus assertions.
 *
 * All waits are event-driven (`fs.watch` on the run dir + the child's `exit`
 * event), bounded by one timeout each; no sleeps. macOS and Linux only: stop
 * and timeout paths signal process groups (`-pid`), which Windows lacks.
 */

/** Cold start of the slowest engine plus CI headroom (observed ~0.4–0.9 s locally). */
export const SHARED_BROWSER_START_TIMEOUT_MS = 60_000;
export const SHARED_BROWSER_STOP_TIMEOUT_MS = 15_000;
/** How often the server checks that the Playwright runner is still alive. */
export const SHARED_BROWSER_WATCH_INTERVAL_MS = 1_000;
/** How long the server waits for a graceful browser close before killing it. */
export const SHARED_BROWSER_CLOSE_TIMEOUT_MS = 10_000;

const SERVER_SCRIPT = path.join(__dirname, 'browser-server.mjs');
const LOG_TAIL_LINES = 20;

export interface StartSharedBrowserOptions {
  /** State-file key: the engine (every UI project on it shares the browser), or a private test key. */
  key: string;
  browserName: SharedBrowserName;
  launchOptions: SharedBrowserLaunchOptions;
  timeoutMs?: number;
}

export interface StopSharedBrowserResult {
  result: 'stopped' | 'not-running' | 'killed';
  /** Distinct workers that connected to the browser during the run. */
  attachedWorkers: number;
  status?: SharedBrowserState['status'];
  serverPid?: number;
}

function logTail(key: string): string {
  try {
    const lines = fs.readFileSync(serverLogPath(key), 'utf8').trimEnd().split('\n');
    return lines.slice(-LOG_TAIL_LINES).join('\n');
  } catch {
    return '(no server log)';
  }
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // Already gone (ESRCH) or not a group leader: nothing left to signal.
  }
}

/** Resolves `true` when `emitter` emits `event`, `false` after `timeoutMs`. */
function waitForChildEvent(emitter: ChildProcess, event: 'exit', timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const onEvent = (): void => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      emitter.off(event, onEvent);
      resolve(false);
    }, timeoutMs);
    emitter.once(event, onEvent);
  });
}

function readStateSafely(key: string): SharedBrowserState | undefined {
  try {
    return readSharedBrowserState(key);
  } catch {
    return undefined;
  }
}

/**
 * Waits until `isDone()` returns a value other than `undefined`, re-checking on
 * every change in the run directory and whenever `extraTrigger` fires.
 * Resolves `undefined` on timeout.
 */
function waitForRunDir<T>(
  isDone: () => T | undefined,
  timeoutMs: number,
  extraTrigger?: (recheck: () => void) => () => void,
): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    let settled = false;
    let watcher: fs.FSWatcher | undefined;
    let removeExtraTrigger: (() => void) | undefined;
    const finish = (value: T | undefined): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      watcher?.close();
      removeExtraTrigger?.();
      resolve(value);
    };
    const check = (): void => {
      const value = isDone();
      if (value !== undefined) {
        finish(value);
      }
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    try {
      watcher = fs.watch(runDir(), check);
    } catch {
      // Run dir removed: `isDone` decides from the files alone.
    }
    removeExtraTrigger = extraTrigger?.(check);
    check();
  });
}

/**
 * Spawns the detached server for `key`, waits until it reports
 * `ready`, and returns its state. Throws {@link SharedBrowserError} with the
 * cause and the server log tail when the browser cannot start, and kills the
 * server if it doesn't become ready within the timeout.
 */
export async function startSharedBrowserServer(options: StartSharedBrowserOptions): Promise<ReadySharedBrowserState> {
  const { key, browserName, launchOptions, timeoutMs = SHARED_BROWSER_START_TIMEOUT_MS } = options;
  const failurePrefix = `${setupProjectName(key)}: could not start the shared ${browserName} browser`;

  const staleRuns = removeStaleRunDirs();
  if (staleRuns.length > 0) {
    logger.info(`[shared-browser] removed leftover state of finished runs: ${staleRuns.join(', ')}`);
  }
  if (readStateSafely(key) !== undefined) {
    // A setup retry or a UI-mode rerun in the same run: never leave two servers for one key.
    await stopSharedBrowserServer(key);
  }

  const serverArgs = sharedBrowserServerArgsSchema.parse({
    key,
    browserName,
    launchOptions,
    statePath: statePath(key),
    runnerPid: currentRunnerPid(),
    watchIntervalMs: SHARED_BROWSER_WATCH_INTERVAL_MS,
    closeTimeoutMs: SHARED_BROWSER_CLOSE_TIMEOUT_MS,
  });

  ensureRunDir();
  const logFd = fs.openSync(serverLogPath(key), 'w', 0o600);
  let exitCode: number | null | undefined;
  const child = spawn(process.execPath, [SERVER_SCRIPT, JSON.stringify(serverArgs)], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  fs.closeSync(logFd);
  child.unref();
  child.once('exit', (code) => {
    exitCode = code;
  });
  child.once('error', () => {
    exitCode = null;
  });

  const outcome = await waitForRunDir<SharedBrowserState | 'exited'>(
    () => {
      const state = readStateSafely(key);
      if (state !== undefined) {
        return state;
      }
      return exitCode === undefined ? undefined : 'exited';
    },
    timeoutMs,
    (recheck) => {
      child.on('exit', recheck);
      child.on('error', recheck);
      return () => {
        child.off('exit', recheck);
        child.off('error', recheck);
      };
    },
  );

  if (outcome === undefined) {
    if (child.pid !== undefined) {
      signalGroup(child.pid, 'SIGKILL');
    }
    throw new SharedBrowserError(`${failurePrefix}: it did not become ready within ${timeoutMs} ms\n${logTail(key)}`);
  }
  if (outcome === 'exited') {
    throw new SharedBrowserError(
      `${failurePrefix}: the server exited (code ${String(exitCode)}) before reporting a state\n${logTail(key)}`,
    );
  }
  if (outcome.status !== 'ready') {
    // The server exits right after writing `failed`; don't report until it has, so nothing is left running.
    const exited = exitCode !== undefined || (await waitForChildEvent(child, 'exit', SHARED_BROWSER_STOP_TIMEOUT_MS));
    if (!exited && child.pid !== undefined) {
      signalGroup(child.pid, 'SIGKILL');
    }
    throw new SharedBrowserError(`${failurePrefix}: ${outcome.error}\n${logTail(key)}`);
  }
  return outcome;
}

/**
 * Stops shared browser `key`'s server: SIGTERM, then waits for the server to remove its
 * state file. It waits on the file, not the pid, because a reparented server
 * can linger as a zombie in a container without an init process. Falls back to
 * SIGKILL of the browser's and the server's process groups (WebKit's
 * `server.process()` is a bash launcher, plan P-3b). Always removes the
 * key's files.
 */
export async function stopSharedBrowserServer(key: string): Promise<StopSharedBrowserResult> {
  const attachedWorkers = listAttachedWorkers(key).length;
  const state = readStateSafely(key);
  try {
    if (state === undefined) {
      return { result: 'not-running', attachedWorkers };
    }
    const { status, serverPid } = state;
    if (state.status !== 'ready' || !isProcessAlive(serverPid)) {
      return { result: 'not-running', attachedWorkers, status, serverPid };
    }
    process.kill(serverPid, 'SIGTERM');
    const removed = await waitForRunDir(
      () => (fs.existsSync(statePath(key)) ? undefined : true),
      SHARED_BROWSER_STOP_TIMEOUT_MS,
    );
    if (removed) {
      return { result: 'stopped', attachedWorkers, status, serverPid };
    }
    signalGroup(state.browserPid, 'SIGKILL');
    signalGroup(serverPid, 'SIGKILL');
    return { result: 'killed', attachedWorkers, status, serverPid };
  } finally {
    removeSharedBrowserFiles(key);
  }
}

/**
 * One CI-log line for the setup project, e.g.
 * `[shared-browser] webkit: started webkit 26.5 (server pid 1, browser pid 2, headless=false) for projects webkit, new_webkit`.
 */
export function formatSharedBrowserStarted(
  state: ReadySharedBrowserState,
  version: string,
  uiProjects: readonly string[],
): string {
  return `[shared-browser] ${state.key}: started ${state.browserName} ${version} (server pid ${state.serverPid}, browser pid ${state.browserPid}, headless=${String(state.headless)}) for projects ${uiProjects.join(', ')}`;
}

/** One CI-log line for the teardown project, e.g. `[shared-browser] chromium: stopped server (pid 123), 4 workers attached`. */
export function formatSharedBrowserSummary(key: string, stop: StopSharedBrowserResult): string {
  const pid = stop.serverPid === undefined ? '' : ` (pid ${stop.serverPid})`;
  const status = stop.status === undefined || stop.status === 'ready' ? '' : `, last status ${stop.status}`;
  return `[shared-browser] ${key}: ${stop.result} server${pid}${status}, ${stop.attachedWorkers} workers attached`;
}
