import { faker } from '@faker-js/faker';
import type { CreateUserPayload } from '../../api/clients/example.client';

/**
 * Faker-based synthetic data builders. Specs never inline raw literals —
 * they pull from here (framework-guidelines principle i: no real
 * user/PII data).
 */

export function buildUserPayload(overrides: Partial<CreateUserPayload> = {}): CreateUserPayload {
  return {
    name: faker.person.fullName(),
    email: faker.internet.email(),
    ...overrides,
  };
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export function buildLoginCredentials(overrides: Partial<LoginCredentials> = {}): LoginCredentials {
  return {
    email: faker.internet.email(),
    password: faker.internet.password({ length: 12 }),
    ...overrides,
  };
}
