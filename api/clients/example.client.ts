import { z } from 'zod';
import { BaseClient } from './base.client';

/** Shape returned by the example "users" resource. */
export const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
});

export type User = z.infer<typeof userSchema>;

export interface CreateUserPayload {
  name: string;
  email: string;
}

/**
 * One typed client per resource, extending `BaseClient`. New endpoints
 * follow this same pattern: extend `BaseClient`, add a typed method — no
 * new auth or parsing logic per client.
 */
export class UsersClient extends BaseClient {
  async getUser(id: number): Promise<User> {
    return this.get<User>('/users/:id', { pathParams: { id } });
  }

  async createUser(payload: CreateUserPayload): Promise<User> {
    return this.post<User>('/users', { data: payload });
  }
}
