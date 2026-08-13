import type { Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Sample page object for the Playwright docs homepage (used by
 * `tests/ui/example.spec.ts` to demonstrate the framework end to end).
 * Locators live once, here — specs never inline raw locators or
 * `page.goto` URLs.
 */
export class ExamplePage extends BasePage {
  readonly heading: Locator;
  readonly getStartedLink: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /playwright/i, level: 1 });
    this.getStartedLink = page.getByRole('link', { name: 'Get started' });
  }

  async open(): Promise<void> {
    await this.goto('/');
  }

  async goToGetStarted(): Promise<void> {
    await this.getStartedLink.click();
  }
}
