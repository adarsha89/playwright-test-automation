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
  saucedemo/           Static fixture data (users, products) for the SauceDemo slice
docs/
  exploration/         Codegen output from headed exploration of target pages
  plans/               Feature plans produced before implementation
  requirements/        Requirements docs produced before planning
  reports/             Code review / quality reports
  debug/               Debug evidence bundles for failing tests
fixtures/
  index.ts            Custom Playwright fixtures (authenticatedPage, exampleClient, testData, ...)
pages/
  base.page.ts         Base page object
  saucedemo/            SauceDemo page objects (login, inventory, cart)
tests/
  ui/                  UI specs (chromium/firefox/webkit projects)
  api/                 API specs (api project)
utils/
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

The `Jenkinsfile` runs on the `mcr.microsoft.com/playwright:v<installed-version>-noble` image (keep the tag in lockstep with `@playwright/test` in `package-lock.json`): install → lint / typecheck / Prettier check (parallel) → `playwright test --shard=SHARD_INDEX/SHARD_TOTAL` (build parameters, default `1/1`), publishing JUnit results and archiving the HTML report/test-results. CI runs headless (`headless: !!process.env.CI`); local runs are headed.

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
