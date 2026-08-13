import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../base.page';

/**
 * Page object for the SauceDemo inventory/products page
 * (`https://www.saucedemo.com/inventory.html`). Locators/copy verified live
 * in `docs/exploration/saucedemo-login-and-cart-codegen.ts`.
 */
export class InventoryPage extends BasePage {
  readonly inventoryList: Locator;
  readonly cartLink: Locator;
  readonly cartBadge: Locator;

  constructor(page: Page) {
    super(page);
    this.inventoryList = page.locator('[data-test="inventory-list"]');
    this.cartLink = page.locator('[data-test="shopping-cart-link"]');
    this.cartBadge = page.locator('[data-test="shopping-cart-badge"]');
  }

  /**
   * Slugifies a product name to match SauceDemo's
   * `[data-test="add-to-cart-<slug>"]` pattern (lowercased, hyphenated),
   * e.g. "Sauce Labs Backpack" -> "sauce-labs-backpack".
   */
  private static slugify(productName: string): string {
    return productName.toLowerCase().replace(/\s+/g, '-');
  }

  async addProductToCart(productName: string): Promise<void> {
    const slug = InventoryPage.slugify(productName);
    const item = this.page
      .locator('.inventory_item')
      .filter({ has: this.page.locator('[data-test="inventory-item-name"]', { hasText: productName }) });
    await item.locator(`[data-test="add-to-cart-${slug}"]`).click();
  }

  /**
   * Returns the cart badge's numeric count, or `0` when the badge element
   * has no matching elements at all — SauceDemo does not render a "0"
   * badge on an empty cart (see exploration artifact).
   */
  async getCartBadgeCount(): Promise<number> {
    if ((await this.cartBadge.count()) === 0) {
      return 0;
    }
    const text = await this.cartBadge.textContent();
    return Number(text);
  }

  async openCart(): Promise<void> {
    await this.cartLink.click();
  }
}
