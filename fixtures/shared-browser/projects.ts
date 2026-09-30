import type { PlaywrightTestOptions, PlaywrightWorkerOptions, Project as PlaywrightProject } from '@playwright/test';
import { SharedBrowserError } from './errors';
import { SHARED_BROWSER_PROJECT_NAME_PATTERN, sharedBrowserNameSchema, type SharedBrowserName } from './types';

/**
 * Builds the projects of the shared-browser execution model
 * (`docs/plans/shared-browser-per-project-plan.md` §6.7, README "Execution model"):
 * ONE shared browser per engine, shared by every UI project on that engine.
 *
 * For each engine used by the given UI projects:
 * 1. `setup_<engine>`: starts the engine's one shared browser server (see `lifecycle.ts`),
 *    declared as a dependency of every UI project on the engine and paired with its teardown.
 * 2. `teardown_<engine>`: stops it. Playwright runs a setup's teardown only after every
 *    project that depends on the setup has finished, so it outlives all of them.
 *
 * Each UI project is returned unchanged except for the added `setup_<engine>` dependency.
 * Its name is free-form (`chromium`, `smoke_chromium`, `mobile_webkit`, ...); the engine
 * always comes from `use` (`browserName`, or the device preset's `defaultBrowserType`),
 * never from the name. Projects on one engine share the browser, so they must launch it
 * the same way (`channel`, `headless`, `launchOptions`); device emulation such as viewport,
 * user agent or `isMobile` is per context and may differ.
 *
 * Teardown projects do not run on Ctrl+C, SIGTERM, SIGKILL or `--global-timeout`
 * (plan P-6/P-7); the server's runner watchdog covers that case.
 *
 * Loaded by `playwright.config.ts` in every process, so this module has no Playwright
 * runtime import and no side effects.
 */

/** A project typed with Playwright's built-in options, so `use.browserName`/`channel`/... are known. */
type Project = PlaywrightProject<PlaywrightTestOptions, PlaywrightWorkerOptions>;

/** Relative to `testDir`. */
export const SHARED_BROWSER_SETUP_FILE = 'setup/shared-browser.setup.ts';
export const SHARED_BROWSER_TEARDOWN_FILE = 'setup/shared-browser.teardown.ts';

const SETUP_PREFIX = 'setup_';
const TEARDOWN_PREFIX = 'teardown_';

/** Playwright's own fallback when neither `browserName` nor a device preset picks one. */
const PLAYWRIGHT_DEFAULT_BROWSER = 'chromium';

export function setupProjectName(key: string): string {
  return `${SETUP_PREFIX}${key}`;
}

export function teardownProjectName(key: string): string {
  return `${TEARDOWN_PREFIX}${key}`;
}

function engineFromName(projectName: string, prefix: string): SharedBrowserName {
  const parsed = sharedBrowserNameSchema.safeParse(
    projectName.startsWith(prefix) ? projectName.slice(prefix.length) : undefined,
  );
  if (!parsed.success) {
    throw new SharedBrowserError(
      `Project "${projectName}" is not a ${prefix}<chromium|firefox|webkit> project; build it with sharedBrowserProjects()`,
    );
  }
  return parsed.data;
}

/** `setup_webkit` → `webkit`; throws for any other name. */
export function engineFromSetupName(projectName: string): SharedBrowserName {
  return engineFromName(projectName, SETUP_PREFIX);
}

/** `teardown_webkit` → `webkit`; throws for any other name. */
export function engineFromTeardownName(projectName: string): SharedBrowserName {
  return engineFromName(projectName, TEARDOWN_PREFIX);
}

type ProjectUse = NonNullable<Project['use']>;

/** The engine a project's `use` resolves to, the same way Playwright's `browserName` fixture does. */
export function engineOfUse(projectName: string, use: Project['use']): SharedBrowserName {
  const { browserName, defaultBrowserType } = (use ?? {}) as ProjectUse & { defaultBrowserType?: string };
  const parsed = sharedBrowserNameSchema.safeParse(browserName ?? defaultBrowserType ?? PLAYWRIGHT_DEFAULT_BROWSER);
  if (!parsed.success) {
    throw new SharedBrowserError(
      `Project "${projectName}" uses an unsupported browser: the shared browser supports chromium, firefox and webkit only`,
    );
  }
  return parsed.data;
}

/** The `use` settings that decide how the shared browser is launched (unset ones left out). */
function launchUse(engine: SharedBrowserName, use: Project['use']): ProjectUse {
  const { channel, headless, launchOptions } = use ?? {};
  return {
    browserName: engine,
    ...(channel === undefined ? {} : { channel }),
    ...(headless === undefined ? {} : { headless }),
    ...(launchOptions === undefined ? {} : { launchOptions }),
  };
}

function checkedProjectName(projectName: string): string {
  if (!SHARED_BROWSER_PROJECT_NAME_PATTERN.test(projectName)) {
    throw new SharedBrowserError(
      `Project name "${projectName}" is not valid for a shared-browser project: use letters, digits, "_", "." or "-"`,
    );
  }
  return projectName;
}

/** A UI project for {@link sharedBrowserProjects}: a normal Playwright project that must have a name. */
export type SharedBrowserUiProject = Project & { name: string };

/**
 * Returns the given UI projects (each depending on its engine's `setup_<engine>`), preceded by
 * one `setup_<engine>` / `teardown_<engine>` pair per engine they use. Throws when two projects
 * on one engine launch it differently, or a name is invalid or clashes with a generated project.
 */
export function sharedBrowserProjects(uiProjects: readonly SharedBrowserUiProject[]): Project[] {
  const launchByEngine = new Map<SharedBrowserName, { use: ProjectUse; firstProject: string }>();
  const generatedNames = new Set<string>();

  const withDependencies = uiProjects.map((project) => {
    const name = checkedProjectName(project.name);
    const engine = engineOfUse(name, project.use);
    const use = launchUse(engine, project.use);
    const existing = launchByEngine.get(engine);
    if (existing === undefined) {
      launchByEngine.set(engine, { use, firstProject: name });
    } else if (JSON.stringify(existing.use) !== JSON.stringify(use)) {
      throw new SharedBrowserError(
        `Projects "${existing.firstProject}" and "${name}" share the ${engine} browser but launch it differently ` +
          `(channel/headless/launchOptions): ${JSON.stringify(existing.use)} vs ${JSON.stringify(use)}`,
      );
    }
    generatedNames.add(setupProjectName(engine)).add(teardownProjectName(engine));
    return { ...project, dependencies: [...(project.dependencies ?? []), setupProjectName(engine)] };
  });

  const clash = uiProjects.find((project) => generatedNames.has(project.name));
  if (clash !== undefined) {
    throw new SharedBrowserError(`Project name "${clash.name}" is reserved for a generated setup/teardown project`);
  }

  const lifecycleProjects = [...launchByEngine].flatMap(([engine, { use }]): Project[] => [
    {
      name: setupProjectName(engine),
      testMatch: SHARED_BROWSER_SETUP_FILE,
      teardown: teardownProjectName(engine),
      use,
    },
    {
      name: teardownProjectName(engine),
      testMatch: SHARED_BROWSER_TEARDOWN_FILE,
      use,
    },
  ]);

  return [...lifecycleProjects, ...withDependencies];
}
