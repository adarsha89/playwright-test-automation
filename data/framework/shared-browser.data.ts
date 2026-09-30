/**
 * Static data for the shared-browser framework verification tests
 * (`tests/ui/framework/shared-browser.spec.ts` and
 * `tests/ui/framework/shared-browser-errors.spec.ts`). See
 * `docs/plans/shared-browser-per-project-plan.md` §5 and §6.9.
 */

/**
 * Origin the verification tests render. `.invalid` is reserved (RFC 2606) and
 * never resolves: every request to it is fulfilled by `context.route()`, so no
 * request leaves the machine and no external site is involved.
 */
export const STATE_PROBE_ORIGIN = 'https://shared-browser.invalid/';

/** Prefix for the random cookie / storage marker names written by the tests. */
export const STATE_MARKER_PREFIX = 'sb-marker-';

/** Path that is only fulfilled while the writer test's context route is active. */
export const LEAK_PROBE_PATH = 'leak-probe';

/** Body served on {@link LEAK_PROBE_PATH}; seeing it in another test means a route leaked. */
export const LEAKED_BODY = 'LEAKED';

/** Result reported by `fetchLeakProbe` when the probe request does not succeed. */
export const LEAK_PROBE_UNREACHABLE = 'unreachable';

/** How long a cross-worker probe waits for a second worker of its project to attach. */
export const CROSS_WORKER_WAIT_MS = 15_000;

export interface SharedBrowserProbe {
  id: 'a' | 'b';
  /** Unique scenario tag, without the leading `@`. */
  tag: string;
}

/**
 * Two identical probes, so that when the spec file runs on its own at least
 * two workers of the same project pick up a test and attach to the browser.
 */
export const SHARED_BROWSER_PROBES: ReadonlyArray<SharedBrowserProbe> = [
  { id: 'a', tag: 'shared-browser-across-workers-probe-a' },
  { id: 'b', tag: 'shared-browser-across-workers-probe-b' },
];

/**
 * Prefixes of the private state keys used by the error-path tests. The spec
 * appends the engine (e.g. `private-crash-webkit`), so the three UI projects
 * running concurrently never share a key, and no key matches a real project.
 */
export const PRIVATE_LAUNCH_FAILURE_PREFIX = 'private-launch-failure-';
export const PRIVATE_CRASH_PREFIX = 'private-crash-';
export const PRIVATE_MISSING_PREFIX = 'private-missing-';

/** An executable path that never exists, so `launchServer` fails before launching anything. */
export const NONEXISTENT_BROWSER_EXECUTABLE = '/nonexistent/shared-browser-probe';

/** Error text of the crafted `crashed` state (the same wording the real server writes). */
export const CRASHED_BROWSER_ERROR = 'browser process exited unexpectedly';

/** Above the default `pid_max` on macOS and Linux, so it is never a live pid. */
export const FAKE_DEAD_SERVER_PID = 2 ** 22 + 1;
