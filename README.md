# playwright-test-automation

A Playwright + TypeScript test automation framework covering UI and API testing, built around typed fixtures, page objects, and API clients.

## Tech stack

- [Playwright Test](https://playwright.dev/) `^1.62` — test runner, browser automation, API testing
- TypeScript (strict mode)
- [Zod](https://zod.dev/) — runtime env-var validation and API response schema validation
- [@faker-js/faker](https://fakerjs.dev/) — synthetic test data generation
- ESLint (flat config) + Prettier
- Jenkins (CI), using the `mcr.microsoft.com/playwright` Docker image

## Project structure

```
api/
  clients/           Typed API clients (e.g. UsersClient)
  helpers/            Auth, request-building, and response-assertion helpers
config/
  env.ts              Single source of truth for environment variables (Zod-validated)
data/
  builders/           Faker-backed test data builders
  framework/           Static data for the framework (shared-browser) verification tests
  saucedemo/           Static fixture data (users, products) for the SauceDemo slice
docs/
  exploration/         Codegen output from headed exploration of target pages
  plans/               Feature plans produced before implementation
  requirements/        Requirements docs produced before planning
  reports/             Code review / quality reports
  debug/               Debug evidence bundles for failing tests
fixtures/
  index.ts            Custom Playwright fixtures (authenticatedPage, exampleClient, testData, shared browser, ...)
  shared-browser/     One shared browser per engine: projects.ts (setup/teardown per engine + UI projects),
                      browser-server.mjs (detached loopback browser server), lifecycle.ts (start/stop),
                      state.ts (per-run state files), client.ts (worker-side readers), types.ts, errors.ts
pages/
  base.page.ts         Base page object
  saucedemo/            SauceDemo page objects (login, inventory, cart)
tests/
  setup/               setup_<engine> / teardown_<engine> projects (start/stop each engine's shared browser)
  ui/                  UI specs (chromium/firefox/webkit projects)
    framework/          Framework verification specs (shared browser, context isolation; @framework)
  api/                 API specs (api project)
utils/
  browser-state.ts     Cookie/storage/permission/route helpers for the isolation tests
  network.ts           Network interception helpers (e.g. beacon assertions)
  url.ts               joinUrl() — safe base-URL + path joining
  logger.ts             Logging helper
```

## Prerequisites

- Node.js 22+
- npm

## Setup

```bash
npm install
npx playwright install
cp .env.example .env   # fill in real values, see below
```

### Environment variables

All env vars are read once through `config/env.ts` (Zod-validated at import time) — nothing else in the codebase reads `process.env` directly. See `.env.example` for the full list:

| Variable                                  | Purpose                                                       |
| ----------------------------------------- | ------------------------------------------------------------- |
| `BASE_URL`                                | Base URL for the default UI project                           |
| `API_BASE_URL`                            | Base URL for the `api` test project                           |
| `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`  | Credentials used by the `authenticatedPage` fixture           |
| `API_AUTH_USERNAME` / `API_AUTH_PASSWORD` | Credentials used by `api/helpers/auth.helper.ts`              |
| `SAUCEDEMO_BASE_URL`                      | Base URL for the SauceDemo feature slice (login + cart tests) |

Each new target site/app gets its own dedicated `<SITE>_BASE_URL` var rather than repointing the shared `BASE_URL` (see `SAUCEDEMO_BASE_URL` for the pattern).

## Running tests

```bash
npm test                          # run the full suite (chromium, firefox, webkit, api)
npx playwright test --project=chromium
npx playwright test tests/ui/saucedemo
npx playwright test --grep @smoke
npx playwright test --grep @network-validation
npx playwright test --ui           # interactive UI mode
npx playwright show-report         # open the last HTML report
```

Every testcase carries Playwright `tag` options — a shared classification tag (`@smoke`, `@regression`, `@api`, ...) plus a unique scenario tag (e.g. `@login-valid-credentials`) — so a single tag identifies exactly which test ran in a report.

### Execution model: one shared browser per engine

- **One browser per engine per run (per shard), started by a setup project.** `sharedBrowserProjects()` in `fixtures/shared-browser/projects.ts` takes the list of UI projects, groups them by engine, and adds one setup project per engine (`setup_chromium`, `setup_firefox`, `setup_webkit`) as a dependency of every UI project on that engine. The setup project starts one loopback-only (`127.0.0.1`) browser server, as a small detached process (`browser-server.mjs`), so the browser outlives the setup worker. Every worker of every UI project on that engine connects to it (e.g. `webkit` and `new_webkit` share one WebKit). The paired `teardown_<engine>` project stops it after the last of those projects has finished. There is **no global setup or teardown**.
- **Adding a UI project.** Add an entry such as `{ name: 'smoke_chromium', testMatch: 'ui/**/*.smoke.spec.ts', use: { ...devices['Desktop Chrome'] } }` to the list passed to `sharedBrowserProjects([...])` in `playwright.config.ts`. The name is free-form (letters, digits, `_`, `.`, `-`; `setup_<engine>`/`teardown_<engine>` are reserved); a `_<browser>` suffix is only a naming convention. The engine comes from `use` (the device preset's `defaultBrowserType`, or `browserName`). Projects on the same engine share its browser, so they must launch it the same way (`channel`, `headless`, `launchOptions`), or the config fails to load with a `share the <engine> browser but launch it differently` error. Device emulation (viewport, user agent, `isMobile`, ...) is per context and may differ.
- **A new context and page per test.** The fixtures only override Playwright's `connectOptions`; `browser`, `context` and `page` stay Playwright's built-ins, so each test gets a fresh context (device emulation, `baseURL`, retries and trace/video/screenshot work as before). Tests never share cookies, storage, permissions or routes, even though they share a browser process.
- **Only what runs starts.** `--project=api`, or a `--grep` that selects only API tests, runs no setup project and starts no browser. `--project=chromium` starts only Chromium. Each `--shard` starts only the engines it has tests for (setup/teardown run in every shard that needs them and are not counted in the shard split).
- **Reports.** Setup and teardown show up as extra entries (e.g. `[setup_webkit] starts the shared browser for every UI project on this engine` and `[teardown_webkit] stops the shared browser after every UI project on this engine`) and in the test counts, HTML and JUnit reports. They are infrastructure checks, tagged `@framework` plus `@setup-shared-browser` / `@teardown-shared-browser`, not application coverage. Each logs one line, e.g. `[shared-browser] webkit: started webkit 26.5 (server pid 123, browser pid 124, headless=false) for projects webkit, new_webkit` and `[shared-browser] webkit: stopped server (pid 123), 5 workers attached`.
- **Interrupted runs.** Playwright does not run teardown projects on Ctrl+C, SIGTERM, a CI abort or `--global-timeout`. Each browser server watches the Playwright runner and shuts its browser down within about 1 s once the runner is gone. Leftover state files in `<os tmpdir>/playwright-shared-browser/` are removed by the next run. Connection details live only there (outside the repo) and are never logged.
- **`--no-deps`** is not supported for UI projects: without `setup_<engine>` the tests fail fast with `[shared-browser] No shared browser "<engine>" in this run: did setup_<engine> run?`.
- **`--debug` / `PWDEBUG`** falls back to Playwright's per-worker browser so the Inspector works.
- **Crashes are loud, not retried.** If a shared browser crashes, every in-flight test of every project on that engine fails with a `[shared-browser] Shared <engine> browser "<engine>" (server pid N) is crashed: ...` error, and later tests of those projects fail immediately with the same cause. If it cannot start, `setup_<engine>` fails with the cause and those projects' tests are reported as "did not run". The browser is not relaunched. Projects on other engines are unaffected.
- **Headed locally** you see one browser app per engine, with each running test's window inside it. Several test windows may be open at once. Headed WebKit on macOS needs an awake display: for unattended headed runs, wrap the command in `caffeinate -dimsu`, or set `CI=1` to run headless.
- Specs must import `{ test, expect }` from `fixtures/` to get this behaviour. A spec importing `@playwright/test` directly uses a per-worker browser. `PW_TEST_CONNECT_WS_ENDPOINT` (remote browsers) is superseded by the shared browser.
- macOS and Linux only (the stop path signals process groups).

Verification tests (`tests/ui/framework/`, tag `@framework`) prove the sharing, the isolation, the error reporting and the project wiring without any external site:

```bash
npx playwright test --grep @framework                                  # all three engines (plus their setup/teardown)
npx playwright test --grep @framework --project=chromium --workers=2   # one engine
```

The two cross-worker probes (`@shared-browser-across-workers-probe-a` / `-b`) need at least 2 workers of the same project. They are **skipped with a reason** when the run uses 1 worker (`--workers=1`), or when only one worker ran that project's tests in a shard. The context-isolation, error-path and wiring tests still run. With the default local worker count and on CI, the probes run and must pass.

### Other scripts

```bash
npm run lint        # ESLint (flat config, eslint.config.mjs)
npm run typecheck   # tsc --noEmit
npm run format        # prettier --write .
npm run format:check  # prettier --check . (CI gate)
```

## Notes

- **Users API tests** (`tests/api/example.spec.ts`, `@api-fetch-user-by-id` / `@api-create-user`) require `API_BASE_URL` to point at a backend implementing both `/auth/login` and `/users`. They will not pass against a public demo API with no auth layer (e.g. jsonplaceholder) — see `.env.example`.
- **SauceDemo slice** (`tests/ui/saucedemo/`) has no mockable backend API; the only real interceptable network traffic is a pair of Backtrace.io analytics beacons, asserted via `utils/network.ts`'s `assertBacktraceEventsBeaconPair`.
- `to_be_automated.md` lists scenarios identified but not yet automated (e.g. the SauceDemo full checkout journey).
- Repo-specific automation conventions, learnings, and non-negotiable workflow rules (e.g. always explore pages headed before writing UI test code, never run Playwright tests inside the sandboxed shell) live in `.ai/context/` — tool-agnostic, and loaded by any AI assistant via `CLAUDE.md` (Claude Code) or `AGENTS.md` (Codex, Cursor, Copilot, Gemini CLI, …). Skills and agents are in `.ai/skills/` and `.ai/agents/` (see `.ai/README.md`).

## CI

The `Jenkinsfile` runs on the `mcr.microsoft.com/playwright:v<installed-version>-noble` image (keep the tag in lockstep with `@playwright/test` in `package-lock.json`): install → lint / typecheck / Prettier check (parallel) → `playwright test --shard=SHARD_INDEX/SHARD_TOTAL` (build parameters, default `1/1`), publishing JUnit results and archiving the HTML report/test-results. CI runs headless (`headless: !!process.env.CI`); local runs are headed. Each build/shard runs `setup_<engine>` / `teardown_<engine>` for the engines it has tests for (see [Execution model](#execution-model-one-shared-browser-per-engine)), logging one `[shared-browser] ... started` and one `... stopped` line per engine. No extra credentials are needed. CI runs more than one worker, so the `@framework` cross-worker probes execute (unless a shard leaves a project with a single worker, in which case they skip with a reason).

Every variable `config/env.ts` validates must exist in CI. Create these Jenkins secret-text credentials:

| Credential ID           | Env var              |
| ----------------------- | -------------------- |
| `qa-base-url`           | `BASE_URL`           |
| `qa-api-base-url`       | `API_BASE_URL`       |
| `qa-test-user-email`    | `TEST_USER_EMAIL`    |
| `qa-test-user-password` | `TEST_USER_PASSWORD` |
| `qa-api-auth-username`  | `API_AUTH_USERNAME`  |
| `qa-api-auth-password`  | `API_AUTH_PASSWORD`  |

`SAUCEDEMO_BASE_URL` is a public demo URL and is set directly in the `Jenkinsfile`.
