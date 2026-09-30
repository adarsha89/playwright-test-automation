import { test as teardown, expect } from '../../fixtures';
import { formatSharedBrowserSummary, stopSharedBrowserServer } from '../../fixtures/shared-browser/lifecycle';
import { engineFromTeardownName } from '../../fixtures/shared-browser/projects';
import { listAttachedWorkers, readSharedBrowserState } from '../../fixtures/shared-browser/state';
import { logger } from '../../utils/logger';

/**
 * `teardown_<engine>` projects (paired with `setup_<engine>` through its `teardown`
 * property): each runs this one test, which stops the engine's shared browser once every
 * UI project on that engine has finished, and logs one summary line.
 * See `docs/plans/shared-browser-per-project-plan.md` §5 (TD-1..3) and §6.10.
 *
 * Playwright skips teardown projects on Ctrl+C, SIGTERM, SIGKILL and
 * `--global-timeout`; the server's runner watchdog stops the browser then.
 */

teardown(
  'stops the shared browser after every UI project on this engine',
  { tag: ['@framework', '@teardown-shared-browser'] },
  async ({}, testInfo) => {
    const engine = engineFromTeardownName(testInfo.project.name);

    const stop = await stopSharedBrowserServer(engine);
    logger.info(formatSharedBrowserSummary(engine, stop));

    expect(['stopped', 'not-running']).toContain(stop.result);
    expect(readSharedBrowserState(engine)).toBeUndefined();
    expect(listAttachedWorkers(engine)).toEqual([]);
  },
);
