import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SharedBrowserError } from './errors';
import { SHARED_BROWSER_PROJECT_NAME_PATTERN, sharedBrowserStateSchema, type SharedBrowserState } from './types';

/**
 * Filesystem layer of the shared-browser execution model, used by the setup
 * and teardown projects, by every UI worker and by the verification specs.
 * See `docs/plans/shared-browser-per-project-plan.md` §6.3.
 *
 * Layout: `<os tmpdir>/playwright-shared-browser/<runnerPid>/`
 * - `<key>.json`      state written by `browser-server.mjs` (see `sharedBrowserStateSchema`)
 * - `<key>.log`       the server's stdout/stderr
 * - `<key>.attached/` one empty `<workerIndex>-<pid>` file per worker that connected
 *
 * `<key>` is the engine (`chromium`, `firefox`, `webkit`): every UI project on that
 * engine shares the one browser. The verification tests use private keys.
 *
 * The root is outside the repo, so connection details can never be
 * committed. Directories are `0o700` and files `0o600`.
 */

export const SHARED_BROWSER_STATE_ROOT = path.join(os.tmpdir(), 'playwright-shared-browser');

const ATTACHMENT_PATTERN = /^(\d+)-(\d+)$/;
const RUN_DIR_PATTERN = /^\d+$/;

/**
 * The run identity. Every Playwright worker (setup, UI and teardown) is a
 * direct child of the runner process, so `process.ppid` is identical across
 * a run and unique per concurrent run (plan P-1). In UI/IDE mode it is the
 * long-lived test-server pid; setup stops any previous server of the same
 * project first, so that is safe.
 */
export function currentRunnerPid(): number {
  return process.ppid;
}

function checkedKey(key: string): string {
  if (!SHARED_BROWSER_PROJECT_NAME_PATTERN.test(key)) {
    throw new SharedBrowserError(`Invalid shared-browser state key: "${key}"`);
  }
  return key;
}

export function runDir(runnerPid: number = currentRunnerPid()): string {
  return path.join(SHARED_BROWSER_STATE_ROOT, String(runnerPid));
}

export function statePath(key: string, runnerPid?: number): string {
  return path.join(runDir(runnerPid), `${checkedKey(key)}.json`);
}

export function serverLogPath(key: string, runnerPid?: number): string {
  return path.join(runDir(runnerPid), `${checkedKey(key)}.log`);
}

export function attachmentsDir(key: string, runnerPid?: number): string {
  return path.join(runDir(runnerPid), `${checkedKey(key)}.attached`);
}

/** Creates the run directory (and the root) with owner-only permissions. */
export function ensureRunDir(runnerPid?: number): string {
  const dir = runDir(runnerPid);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function isErrnoException(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

/**
 * The state of shared browser `key` in this run, or `undefined` when there is no state file.
 * Throws {@link SharedBrowserError} if the file exists but is not a valid state.
 */
export function readSharedBrowserState(key: string, runnerPid?: number): SharedBrowserState | undefined {
  const file = statePath(key, runnerPid);
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (isErrnoException(error, 'ENOENT')) {
      return undefined;
    }
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    throw new SharedBrowserError(`Shared-browser state "${key}" is not valid JSON`);
  }
  const parsed = sharedBrowserStateSchema.safeParse(json);
  if (!parsed.success) {
    throw new SharedBrowserError(`Shared-browser state "${key}" has an unexpected shape`);
  }
  return parsed.data;
}

/**
 * Atomically writes a state file (temp file + rename, `0o600`). Mirrors the
 * writer in `browser-server.mjs`; used by the crash-attribution test.
 */
export function writeSharedBrowserState(state: SharedBrowserState): void {
  const valid = sharedBrowserStateSchema.parse(state);
  ensureRunDir(valid.runnerPid);
  const file = statePath(valid.key, valid.runnerPid);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(valid), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Removes shared browser `key`'s state, log and attachments, then the run dir if it is now empty. */
export function removeSharedBrowserFiles(key: string, runnerPid?: number): void {
  fs.rmSync(statePath(key, runnerPid), { force: true });
  fs.rmSync(serverLogPath(key, runnerPid), { force: true });
  fs.rmSync(attachmentsDir(key, runnerPid), { recursive: true, force: true });
  try {
    fs.rmdirSync(runDir(runnerPid));
  } catch (error) {
    if (!isErrnoException(error, 'ENOTEMPTY') && !isErrnoException(error, 'ENOENT')) {
      throw error;
    }
  }
}

/** Records that this worker process connected to shared browser `key`. */
export function registerWorkerAttachment(key: string, workerIndex: number, pid: number): void {
  const dir = attachmentsDir(key);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, `${workerIndex}-${pid}`), '', { mode: 0o600 });
}

/** Every worker (of any project) that attached to shared browser `key` in this run, one entry per `workerIndex`. */
export function listAttachedWorkers(key: string): Array<{ workerIndex: number; pid: number }> {
  let names: string[];
  try {
    names = fs.readdirSync(attachmentsDir(key));
  } catch (error) {
    if (isErrnoException(error, 'ENOENT')) {
      return [];
    }
    throw error;
  }
  const byWorkerIndex = new Map<number, number>();
  for (const name of names) {
    const match = ATTACHMENT_PATTERN.exec(name);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      byWorkerIndex.set(Number(match[1]), Number(match[2]));
    }
  }
  return [...byWorkerIndex.entries()].sort(([a], [b]) => a - b).map(([workerIndex, pid]) => ({ workerIndex, pid }));
}

/** Every valid state file in this run's directory (all keys). */
export function listSharedBrowserStates(runnerPid?: number): SharedBrowserState[] {
  let names: string[];
  try {
    names = fs.readdirSync(runDir(runnerPid));
  } catch (error) {
    if (isErrnoException(error, 'ENOENT')) {
      return [];
    }
    throw error;
  }
  return names
    .filter((name) => name.endsWith('.json'))
    .map((name) => readSharedBrowserState(name.slice(0, -'.json'.length), runnerPid))
    .filter((state): state is SharedBrowserState => state !== undefined);
}

/** `true` if a process with this pid exists (`EPERM` means it exists but belongs to someone else). */
export function isProcessAlive(pid: number): boolean {
  // pid 0 / negative values address process groups, not a single process.
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isErrnoException(error, 'EPERM');
  }
}

/**
 * Deletes run directories left behind by runs whose runner is gone (e.g. a
 * SIGKILLed run). Idempotent under concurrent callers. It never kills
 * processes: each server's runner watchdog already exits on its own, and
 * killing by a recorded pid would risk hitting a reused pid.
 * Returns the removed directory names.
 */
export function removeStaleRunDirs(): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(SHARED_BROWSER_STATE_ROOT);
  } catch (error) {
    if (isErrnoException(error, 'ENOENT')) {
      return [];
    }
    throw error;
  }
  const current = String(currentRunnerPid());
  const stale = names.filter((name) => RUN_DIR_PATTERN.test(name) && name !== current && !isProcessAlive(Number(name)));
  for (const name of stale) {
    fs.rmSync(path.join(SHARED_BROWSER_STATE_ROOT, name), { recursive: true, force: true });
  }
  return stale;
}
