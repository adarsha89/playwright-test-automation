import 'dotenv/config';
import { z } from 'zod';

/**
 * Typed, validated environment accessor.
 *
 * All environment variable reads for the framework go through this module.
 * Nothing else in the codebase should read `process.env.X` directly
 * (framework-guidelines principle c).
 *
 * Parsing happens once at import time; if a required variable is missing or
 * malformed, this throws immediately with a clear message instead of
 * failing deep inside a test.
 */
const envSchema = z.object({
  BASE_URL: z.string().url(),
  API_BASE_URL: z.string().url(),
  TEST_USER_EMAIL: z.string().email(),
  TEST_USER_PASSWORD: z.string().min(1),
  API_AUTH_USERNAME: z.string().min(1),
  API_AUTH_PASSWORD: z.string().min(1),
  SAUCEDEMO_BASE_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid or missing environment variables. Check your .env file against .env.example:\n${issues}`);
  }

  return parsed.data;
}

export const env: Env = loadEnv();

/**
 * True under `--debug` / `PWDEBUG` (mirrors playwright-core's `debugMode()`:
 * any value except `'0'` / `'false'` enables it). The shared-browser fixture
 * uses it to fall back to a per-worker browser so the Inspector works.
 */
export function isPlaywrightDebugMode(): boolean {
  const value = process.env.PWDEBUG;
  return value !== undefined && value !== '' && value !== '0' && value !== 'false';
}
