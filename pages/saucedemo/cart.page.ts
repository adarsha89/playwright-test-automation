import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * Page object for the SauceDemo cart page
 * (`https://www.saucedemo.com/cart.html`). Locators verified live in
 * `docs/exploration/saucedemo-login-and-cart-codegen.ts`.
 */
export class CartPage extends BasePage {
  readonly cartItems: Locator;
  readonly cartItemNames: Locator;

  constructor(page: Page) {
    super(page);
    this.cartItems = page.locator('.cart_item');
    this.cartItemNames = this.cartItems.locator('[data-test="inventory-item-name"]');
  }

  async getCartItemNames(): Promise<string[]> {
    return this.cartItemNames.allTextContents();
  }

  async hasProduct(name: string): Promise<boolean> {
    const names = await this.getCartItemNames();
    return names.includes(name);
  }
}
