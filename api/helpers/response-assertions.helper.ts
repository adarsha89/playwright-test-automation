import { expect, type APIResponse } from '@playwright/test';
import type { ZodType } from 'zod';

/**
 * Shared response assertion helpers. Specs assert through these instead of
 * inline `expect(res.status()).toBe(...)`/JSON checks scattered per file.
 */

/** Asserts the response status code and returns the response for chaining. */
export async function expectStatus(response: APIResponse, code: number): Promise<APIResponse> {
  expect(
    response.status(),
    `Expected status ${code} but got ${response.status()}: ${await response.text()}`,
  ).toBe(code);
  return response;
}

/** Validates a parsed body against a zod schema, returning the typed, parsed value. */
export function expectSchema<T>(body: unknown, schema: ZodType<T>): T {
  const result = schema.safeParse(body);
  expect(result.success, `Response body failed schema validation: ${JSON.stringify(result.error?.issues)}`).toBe(
    true,
  );
  return result.data as T;
}

/** Common `{ error, message }`-style error shape checker. */
export function expectErrorShape(body: unknown): asserts body is { error: string; message: string } {
  expect(body, 'Expected an error response body').toBeTruthy();
  const errorBody = body as Record<string, unknown>;
  expect(typeof errorBody.error === 'string' || typeof errorBody.message === 'string').toBe(true);
}
