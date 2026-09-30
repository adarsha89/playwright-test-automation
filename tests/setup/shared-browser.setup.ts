import { test as setup, expect } from '../../fixtures';
import { toSharedBrowserName } from '../../fixtures/shared-browser/client';
import {
  formatSharedBrowserStarted,
  SHARED_BROWSER_START_TIMEOUT_MS,
  startSharedBrowserServer,
} from '../../fixtures/shared-browser/lifecycle';
import { engineFromSetupName } from '../../fixtures/shared-browser/projects';
import { logger } from '../../utils/logger';

/**
 * `setup_<engine>` projects (built by `sharedBrowserProjects()`, a dependency of every
 * UI project on that engine): each runs this one test, which starts the engine's ONE
 * shared browser server for this run/shard. All UI projects on the engine share it.
 * See `docs/plans/shared-browser-per-project-plan.md` §5 (SU-1..3) and §6.10.
 *
 * The test requests no `browser`/`context`/`page`, so it launches nothing itself;
 * it reads the project's resolved launch settings from the worker option fixtures.
 */

setup(
  'starts the shared browser for every UI project on this engine',
  { tag: ['@framework', '@setup-shared-browser'] },
  async ({ browserName, headless, channel, launchOptions, playwright }, testInfo) => {
    setup.setTimeout(SHARED_BROWSER_START_TIMEOUT_MS + 15_000);
    const engine = engineFromSetupName(testInfo.project.name);
    expect(toSharedBrowserName(browserName)).toBe(engine);
    const uiProjects = testInfo.config.projects
      .filter((project) => project.dependencies.includes(testInfo.project.name))
      .map((project) => project.name);

    const state = await startSharedBrowserServer({
      key: engine,
      browserName: engine,
      launchOptions: {
        headless,
        channel,
        args: launchOptions.args,
        executablePath: launchOptions.executablePath,
      },
    });

    expect(state.key).toBe(engine);
    expect(state.browserName).toBe(browserName);
    expect(state.headless).toBe(headless);

    // Prove the endpoint serves a working browser before any dependent worker relies on it.
    const probe = await playwright[browserName].connect(state.wsEndpoint);
    const version = probe.version();
    expect(probe.isConnected()).toBe(true);
    expect(version).not.toBe('');
    await probe.close();

    logger.info(formatSharedBrowserStarted(state, version, uiProjects));
    testInfo.annotations.push({
      type: 'shared-browser',
      description: `projects=${uiProjects.join(',')} engine=${state.browserName} version=${version} serverPid=${state.serverPid} browserPid=${state.browserPid} headless=${String(state.headless)}`,
    });
  },
);
