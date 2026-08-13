import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { env } from '../../config/env';

/**
 * Page object for the SauceDemo login page (`https://www.saucedemo.com/`).
 * Locators/copy verified live in
 * `docs/exploration/saucedemo-login-and-cart-codegen.ts`.
 */
export class LoginPage extends BasePage {
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.usernameInput = page.locator('#user-name');
    this.passwordInput = page.locator('#password');
    this.loginButton = page.locator('#login-button');
    this.errorMessage = page.locator('[data-test="error"]');
  }

  async open(): Promise<void> {
    await this.goto(env.SAUCEDEMO_BASE_URL);
  }

  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async getErrorText(): Promise<string | null> {
    return this.errorMessage.textContent();
  }
}
