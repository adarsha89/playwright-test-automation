const ERROR_PREFIX = '[shared-browser]';

/**
 * Every shared-browser failure surfaces as this error, with a
 * `[shared-browser]` message prefix, so a report line alone names the shared
 * browser as the cause.
 *
 * Lives in its own dependency-free module because both `state.ts` (malformed
 * state file) and `client.ts` (worker-side readers, which build on `state.ts`)
 * throw it; `client.ts` re-exports it as the public entry point.
 */
export class SharedBrowserError extends Error {
  constructor(message: string) {
    super(message.startsWith(ERROR_PREFIX) ? message : `${ERROR_PREFIX} ${message}`);
    this.name = 'SharedBrowserError';
  }
}
