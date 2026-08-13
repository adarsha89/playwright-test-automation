import { test, expect } from '../../fixtures';
import { userSchema } from '../../api/clients/example.client';
import { expectSchema } from '../../api/helpers/response-assertions.helper';

/**
 * Demonstrates the API layer wired end to end: worker-scoped auth fixture ->
 * typed `exampleClient` -> faker-backed `testData` -> shared schema
 * assertion helper. No ad-hoc auth, request building, or inline response
 * parsing here.
 *
 * Note: this sample targets a demo `API_BASE_URL`; point it at a backend
 * that implements `/auth/login` and the `/users` resource to actually run
 * it (see .env.example).
 */
test.describe('Users API', () => {
  test('fetches a user by id', { tag: ['@api', '@api-fetch-user-by-id'] }, async ({ exampleClient }) => {
    const user = await exampleClient.getUser(1);

    const validated = expectSchema(user, userSchema);
    expect(validated.id).toBe(1);
  });

  test('creates a user from generated test data', { tag: ['@api', '@api-create-user'] }, async ({ exampleClient, testData }) => {
    const created = await exampleClient.createUser(testData.user);

    const validated = expectSchema(created, userSchema);
    expect(validated.name).toBe(testData.user.name);
    expect(validated.email).toBe(testData.user.email);
  });
});
