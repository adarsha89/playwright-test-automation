import { z } from 'zod';

/**
 * Types and schemas shared by the shared-browser pieces: the detached server
 * script (`browser-server.mjs`), the filesystem layer (`state.ts`), the
 * setup/teardown lifecycle (`lifecycle.ts`) and the worker-side readers
 * (`client.ts`).
 *
 * Kept dependency-light (Zod only) so workers never load the lifecycle code.
 * Everything that crosses a process boundary (the server's argv JSON and the
 * per-engine state file) is validated against these schemas.
 * See `docs/plans/shared-browser-per-project-plan.md` §6.2.
 */

export const SHARED_BROWSER_NAMES = ['chromium', 'firefox', 'webkit'] as const;

export const sharedBrowserNameSchema = z.enum(SHARED_BROWSER_NAMES);

export type SharedBrowserName = z.infer<typeof sharedBrowserNameSchema>;

/**
 * Names a UI project built by `sharedBrowserProjects()` may use (e.g. `chromium`,
 * `smoke_chromium`, `mobile_webkit`), and the characters allowed in a shared-browser
 * state key (the engine name, or a private key in the verification tests), which is used
 * as a filename. The project name does not pick the engine: that comes from the
 * project's `use` (`browserName` / the device preset's `defaultBrowserType`).
 */
export const SHARED_BROWSER_PROJECT_NAME_PATTERN = /^[\w.-]+$/;

/**
 * JSON-serializable subset of the project's `launchOptions` that is forwarded
 * to `browserType.launchServer()`. `slowMo`, `logger`, `env` and other
 * client-side or non-serializable fields are not forwarded.
 */
export const sharedBrowserLaunchOptionsSchema = z.object({
  headless: z.boolean().optional(),
  channel: z.string().optional(),
  args: z.array(z.string()).optional(),
  executablePath: z.string().optional(),
});

export type SharedBrowserLaunchOptions = z.infer<typeof sharedBrowserLaunchOptionsSchema>;

const stateBaseShape = {
  key: z.string().min(1),
  browserName: sharedBrowserNameSchema,
  serverPid: z.number().int().positive(),
  runnerPid: z.number().int().positive(),
};

const readyStateSchema = z.object({
  ...stateBaseShape,
  status: z.literal('ready'),
  /** Loopback websocket endpoint of the engine's `BrowserServer` (unguessable path; never log it). */
  wsEndpoint: z.string().startsWith('ws://127.0.0.1:'),
  browserPid: z.number().int().positive(),
  headless: z.boolean().optional(),
});

const failedStateSchema = z.object({ ...stateBaseShape, status: z.literal('failed'), error: z.string() });

const crashedStateSchema = z.object({ ...stateBaseShape, status: z.literal('crashed'), error: z.string() });

/**
 * Contents of `<tmp>/playwright-shared-browser/<runnerPid>/<key>.json` (`<key>` = the engine, e.g. `webkit`).
 * Written atomically by `browser-server.mjs` (and by `writeSharedBrowserState`
 * in `state.ts`, which must stay in parity with it).
 */
export const sharedBrowserStateSchema = z.discriminatedUnion('status', [
  readyStateSchema,
  failedStateSchema,
  crashedStateSchema,
]);

export type SharedBrowserState = z.infer<typeof sharedBrowserStateSchema>;

export type ReadySharedBrowserState = z.infer<typeof readyStateSchema>;

/** The JSON passed as `argv[2]` to `browser-server.mjs`. */
export const sharedBrowserServerArgsSchema = z.object({
  key: z.string().min(1),
  browserName: sharedBrowserNameSchema,
  launchOptions: sharedBrowserLaunchOptionsSchema,
  statePath: z.string().min(1),
  runnerPid: z.number().int().positive(),
  watchIntervalMs: z.number().int().positive(),
  closeTimeoutMs: z.number().int().positive(),
});

export type SharedBrowserServerArgs = z.infer<typeof sharedBrowserServerArgsSchema>;
