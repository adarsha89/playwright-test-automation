// @ts-check
/**
 * Detached shared-browser server: ONE per browser engine per test run (per shard), shared by every UI project on it.
 * See `docs/plans/shared-browser-per-project-plan.md` §6.1 and README "Execution model".
 *
 * Spawned only by `lifecycle.ts` (from the `setup_<engine>` project test); do not run it by hand.
 * It must outlive the setup worker (a browser launched inside the worker dies with it, plan P-0),
 * so it runs as its own detached process and every worker of those projects connects to it.
 *
 * Plain ESM JavaScript, executed by bare `node` outside the Playwright transpiler, type-checked
 * through `// @ts-check` + `tsconfig.json` `checkJs`. No top-level `await` (the repo compiles with
 * `module: commonjs`, plan P-12).
 *
 * Contract: `argv[2]` is the JSON described by `sharedBrowserServerArgsSchema` in `types.ts`, and
 * the state file written to `statePath` must match `sharedBrowserStateSchema` in `types.ts`:
 * - `ready`   after `launchServer` succeeded (loopback only, Playwright's unguessable default ws path)
 * - `failed`  when `launchServer` threw (then exits 1)
 * - `crashed` when the browser exited on its own (then exits 1)
 * The state file is removed on a graceful shutdown (SIGTERM/SIGINT/SIGHUP from teardown, or the
 * runner watchdog noticing the Playwright runner is gone, plan P-6/P-7).
 * The `wsEndpoint` is never logged.
 */
import fs from 'node:fs';
import { chromium, firefox, webkit } from '@playwright/test';

/** @typedef {import('./types').SharedBrowserServerArgs} SharedBrowserServerArgs */
/** @typedef {import('./types').SharedBrowserState} SharedBrowserState */
/** @typedef {import('@playwright/test').BrowserServer} BrowserServer */

const BROWSER_TYPES = { chromium, firefox, webkit };

/** @type {SharedBrowserServerArgs} */
const args = JSON.parse(process.argv[2] ?? '{}');
const { key, browserName, launchOptions, statePath, runnerPid, watchIntervalMs, closeTimeoutMs } = args;

/** @param {string} message */
function log(message) {
  console.log(`${new Date().toISOString()} [shared-browser-server] ${key} (${browserName}): ${message}`);
}

/** @param {unknown} error */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Atomic write (temp file + rename), owner-only permissions.
 * @param {SharedBrowserState} state
 */
function writeState(state) {
  const tmp = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(tmp, statePath);
}

function removeState() {
  fs.rmSync(statePath, { force: true });
}

/** @type {BrowserServer | undefined} */
let server;
let shuttingDown = false;
/** @type {NodeJS.Timeout | undefined} */
let watchdog;

/**
 * Closes the browser (force-kills it after `closeTimeoutMs`), removes the state file and exits.
 * Re-entrancy guarded.
 * @param {string} reason
 */
async function shutdown(reason) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  clearInterval(watchdog);
  log(`shutting down: ${reason}`);
  if (server) {
    const running = server;
    /** @type {NodeJS.Timeout | undefined} */
    let timer;
    const closed = await Promise.race([
      running.close().then(
        () => true,
        () => false,
      ),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), closeTimeoutMs);
      }),
    ]);
    clearTimeout(timer);
    if (!closed) {
      log(`browser did not close within ${closeTimeoutMs} ms: killing it`);
      await running.kill().catch(() => undefined);
    }
  }
  removeState();
  process.exit(0);
}

/** Exits when the Playwright runner is gone (teardown projects don't run on interrupts). */
function isRunnerAlive() {
  try {
    process.kill(runnerPid, 0);
    return true;
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error).code === 'EPERM';
  }
}

async function main() {
  for (const signal of /** @type {const} */ (['SIGTERM', 'SIGINT', 'SIGHUP'])) {
    process.on(signal, () => void shutdown(`received ${signal}`));
  }
  watchdog = setInterval(() => {
    if (!isRunnerAlive()) {
      void shutdown(`runner pid ${runnerPid} is gone`);
    }
  }, watchIntervalMs);

  const base = { key, browserName, serverPid: process.pid, runnerPid };
  try {
    server = await BROWSER_TYPES[browserName].launchServer({
      ...launchOptions,
      host: '127.0.0.1',
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    });
  } catch (error) {
    log(`launch failed: ${messageOf(error)}`);
    writeState({ ...base, status: 'failed', error: messageOf(error) });
    process.exit(1);
  }
  if (shuttingDown) {
    // A stop signal arrived while the browser was launching: shutdown() is already closing it.
    return;
  }

  const browserPid = server.process().pid;
  if (browserPid === undefined) {
    const error = `${browserName} browser process has no pid`;
    log(`launch failed: ${error}`);
    await server.kill().catch(() => undefined);
    writeState({ ...base, status: 'failed', error });
    process.exit(1);
  }

  server.on('close', () => {
    if (shuttingDown) {
      return;
    }
    clearInterval(watchdog);
    const error = `${browserName} browser process exited unexpectedly`;
    log(`crashed: ${error}`);
    writeState({ ...base, status: 'crashed', error });
    process.exit(1);
  });

  writeState({
    ...base,
    status: 'ready',
    wsEndpoint: server.wsEndpoint(),
    browserPid,
    headless: launchOptions.headless,
  });
  log(`ready browserPid=${browserPid} headless=${String(launchOptions.headless)}`);
}

main().catch((error) => {
  log(`fatal: ${messageOf(error)}`);
  process.exit(1);
});
