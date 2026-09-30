import type { BrowserContext } from '@playwright/test';
import { test, expect, type ReadySharedBrowserState } from '../../../fixtures';
import { engineOfUse, setupProjectName, teardownProjectName } from '../../../fixtures/shared-browser/projects';
import {
  listAttachedWorkers,
  listSharedBrowserStates,
  readSharedBrowserState,
} from '../../../fixtures/shared-browser/state';
import {
  CROSS_WORKER_WAIT_MS,
  LEAKED_BODY,
  SHARED_BROWSER_PROBES,
  STATE_PROBE_ORIGIN,
} from '../../../data/framework/shared-browser.data';
import { buildStateMarker } from '../../../data/builders/state-marker.builder';
import { fetchLeakProbe, readBrowserState, serveStubPage, writeMarkerState } from '../../../utils/browser-state';

/**
 * Framework verification for the shared-browser execution model
 * (docs/plans/shared-browser-per-project-plan.md §5, TC-1 to TC-4 and TC-8):
 * one browser per UI project, started by its `setup_<project>` dependency and
 * shared by every worker of the project, with a new context per test.
 * No external site: the only page is a stub served by `context.route()` at a
 * reserved `.invalid` origin, so there is nothing to explore with codegen.
 */

const CLEAN_STATE = { cookieNames: [], localStorageKeys: [], sessionStorageKeys: [], geolocationPermission: 'prompt' };

function requireSharedBrowser(sharedBrowser: ReadySharedBrowserState | null): ReadySharedBrowserState {
  if (!sharedBrowser) {
    throw new Error('No shared browser: these checks cannot run under --debug/PWDEBUG (per-worker browser)');
  }
  return sharedBrowser;
}

test.describe('Shared browser across workers', () => {
  test.describe.configure({ mode: 'parallel' });

  for (const probe of SHARED_BROWSER_PROBES) {
    test(
      `uses the project's single shared browser from every worker (probe ${probe.id})`,
      { tag: ['@regression', '@framework', `@${probe.tag}`] },
      async ({ browser, context, page, browserName, sharedBrowser, connectOptions }, testInfo) => {
        // eslint-disable-next-line playwright/no-skipped-test -- runtime skip required by AC-6 (1 worker cannot show sharing)
        test.skip(
          testInfo.config.workers < 2,
          'Cross-worker sharing needs >= 2 workers; this run uses 1 (--workers=1). Isolation tests still ran.',
        );
        const shared = requireSharedBrowser(sharedBrowser);
        const projectName = testInfo.project.name;

        // The built-in `browser` fixture took the connect path to the state file's endpoint (set up by setup_<engine>).
        expect(connectOptions?.wsEndpoint).toBe(shared.wsEndpoint);
        expect(readSharedBrowserState(browserName)).toEqual(shared);
        expect(shared.browserName).toBe(browserName);
        expect(browser.browserType().name()).toBe(browserName);
        expect(browser.contexts()).toHaveLength(1);
        expect(browser.contexts()[0]).toBe(context);

        await serveStubPage(context, STATE_PROBE_ORIGIN);
        await page.goto(STATE_PROBE_ORIGIN);
        expect(await readBrowserState(context, page)).toEqual(CLEAN_STATE);
        const marker = buildStateMarker();
        await writeMarkerState(context, page, STATE_PROBE_ORIGIN, marker);

        // Wait (bounded) until a second worker process (of this or another project on the engine) has attached.
        const joined = await expect
          .poll(() => listAttachedWorkers(browserName).length, { timeout: CROSS_WORKER_WAIT_MS })
          .toBeGreaterThanOrEqual(2)
          .then(
            () => true,
            () => false,
          );
        // eslint-disable-next-line playwright/no-skipped-test -- runtime skip required by AC-6 (only one worker served this project)
        test.skip(
          !joined,
          `Only one worker used the shared ${browserName} browser in this run/shard (project ${projectName}), so cross-worker sharing cannot be demonstrated.`,
        );

        const attachedWorkers = listAttachedWorkers(browserName);
        expect(attachedWorkers.map((worker) => worker.workerIndex)).toContain(testInfo.workerIndex);
        expect(new Set(attachedWorkers.map((worker) => worker.pid)).size).toBeGreaterThanOrEqual(2);

        // AC-2: every other engine in this run has its own, different server and browser
        // (projects on the same engine, e.g. `webkit` and `new_webkit`, share this one).
        const otherEngines = listSharedBrowserStates().filter(
          (state): state is ReadySharedBrowserState => state.status === 'ready' && state.key !== browserName,
        );
        expect(otherEngines.map((state) => state.serverPid)).not.toContain(shared.serverPid);
        expect(otherEngines.map((state) => state.browserPid)).not.toContain(shared.browserPid);
        expect(otherEngines.map((state) => state.browserName)).not.toContain(browserName);

        // Other workers wrote their own markers into their own contexts in this same browser process.
        expect(await readBrowserState(context, page)).toEqual({
          cookieNames: [marker],
          localStorageKeys: [marker],
          sessionStorageKeys: [marker],
          geolocationPermission: 'granted',
        });

        testInfo.annotations.push({
          type: 'shared-browser',
          description: `project=${projectName} engine=${browserName} serverPid=${shared.serverPid} browserPid=${shared.browserPid} workerIndex=${testInfo.workerIndex} attachedWorkers=${attachedWorkers.length}`,
        });
      },
    );
  }
});

test.describe('Fresh context per test', () => {
  test.describe.configure({ mode: 'serial' });

  let previousContext: BrowserContext | undefined;
  let previousContextClosed = false;

  test(
    'first test in a worker writes cookies, storage, permissions and routes into its own context',
    { tag: ['@regression', '@framework', '@isolated-context-first-test-writes-state'] },
    async ({ browser, context, page }) => {
      expect(browser.contexts()).toHaveLength(1);
      expect(browser.contexts()[0]).toBe(context);

      await serveStubPage(context, STATE_PROBE_ORIGIN, { leakProbe: true });
      await page.goto(STATE_PROBE_ORIGIN);
      expect(await readBrowserState(context, page)).toEqual(CLEAN_STATE);

      const marker = buildStateMarker();
      await writeMarkerState(context, page, STATE_PROBE_ORIGIN, marker);

      // Sanity: the state really exists, so the next test's "clean" result is not vacuous.
      expect(await readBrowserState(context, page)).toEqual({
        cookieNames: [marker],
        localStorageKeys: [marker],
        sessionStorageKeys: [marker],
        geolocationPermission: 'granted',
      });
      expect(await fetchLeakProbe(page)).toBe(LEAKED_BODY);

      previousContext = context;
      context.on('close', () => {
        previousContextClosed = true;
      });
    },
  );

  test(
    'next test in the same worker gets a new context with none of that state',
    { tag: ['@regression', '@framework', '@isolated-context-next-test-starts-clean'] },
    async ({ browser, context, page }) => {
      expect(previousContext).toBeDefined();
      expect(context).not.toBe(previousContext);
      expect(previousContextClosed).toBe(true);
      expect(browser.contexts()).toHaveLength(1);
      expect(browser.contexts()[0]).toBe(context);

      await serveStubPage(context, STATE_PROBE_ORIGIN);
      await page.goto(STATE_PROBE_ORIGIN);

      expect(await readBrowserState(context, page)).toEqual(CLEAN_STATE);
      expect(await fetchLeakProbe(page)).not.toBe(LEAKED_BODY);
    },
  );
});

test(
  "wires the project to its engine's shared setup_<engine> dependency with no global setup",
  { tag: ['@regression', '@framework', '@shared-browser-project-wiring'] },
  async ({ browserName }, testInfo) => {
    const projectName = testInfo.project.name;
    const setupName = setupProjectName(browserName);
    const teardownName = teardownProjectName(browserName);
    const projects = testInfo.config.projects;

    expect(testInfo.project.dependencies).toEqual([setupName]);
    const setupProject = projects.find((project) => project.name === setupName);
    const teardownProject = projects.find((project) => project.name === teardownName);
    expect(setupProject).toMatchObject({ teardown: teardownName, dependencies: [] });
    expect(setupProject?.use.browserName).toBe(browserName);
    expect(teardownProject?.use.browserName).toBe(browserName);

    // Every UI project that depends on this setup (this one included) is on the same engine, so they share one browser.
    const dependents = projects.filter((project) => project.dependencies.includes(setupName));
    expect(dependents.map((project) => project.name)).toContain(projectName);
    for (const project of dependents) {
      expect(engineOfUse(project.name, project.use)).toBe(browserName);
    }
    expect(projects.filter((project) => project.name === setupName)).toHaveLength(1);
    expect(projects.find((project) => project.name === 'api')?.dependencies).toEqual([]);
    expect(testInfo.config.globalSetup).toBeNull();
    expect(testInfo.config.globalTeardown).toBeNull();
  },
);
