/**
 * Fixed public-demo constants for the SauceDemo site
 * (`https://www.saucedemo.com/`). These are stable, well-known SauceDemo
 * test accounts, not synthetic/faker-generated data — see
 * `docs/requirements/saucedemo-login-and-cart-requirements.md` ("No
 * credential provisioning ... required for the specific usernames
 * themselves, since they are public demo values").
 */

export interface SauceDemoUser {
  username: string;
  password: string;
}

export const SAUCEDEMO_USERS = {
  standard: { username: 'standard_user', password: 'secret_sauce' } satisfies SauceDemoUser,
  lockedOut: { username: 'locked_out_user', password: 'secret_sauce' } satisfies SauceDemoUser,
} as const;

export interface InvalidLoginCase {
  tag: string;
  username: string;
  password: string;
  expectedError: string;
}

export const INVALID_LOGIN_CASES: InvalidLoginCase[] = [
  {
    tag: 'login-locked-out-user',
    username: SAUCEDEMO_USERS.lockedOut.username,
    password: SAUCEDEMO_USERS.lockedOut.password,
    expectedError: 'Epic sadface: Sorry, this user has been locked out.',
  },
  {
    tag: 'login-invalid-password',
    username: SAUCEDEMO_USERS.standard.username,
    password: 'wrong_password_123',
    expectedError: 'Epic sadface: Username and password do not match any user in this service',
  },
];

export const SAUCEDEMO_PRODUCTS = {
  BACKPACK: 'Sauce Labs Backpack',
} as const;
