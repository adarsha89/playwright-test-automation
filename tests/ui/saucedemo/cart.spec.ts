import { test, expect } from '../../../fixtures';
import { InventoryPage } from '../../../pages/saucedemo/inventory.page';
import { CartPage } from '../../../pages/saucedemo/cart.page';
import { SAUCEDEMO_PRODUCTS } from '../../../data/saucedemo/saucedemo-users.data';
import { assertBacktraceEventsBeaconPair } from '../../../utils/network';

test.describe('SauceDemo add to cart', () => {
  test(
    'adds a product to the cart and shows it on the cart page',
    { tag: ['@smoke', '@network-validation', '@cart-add-product'] },
    async ({ sauceDemoAuthenticatedPage }) => {
      const inventoryPage = new InventoryPage(sauceDemoAuthenticatedPage);
      const cartPage = new CartPage(sauceDemoAuthenticatedPage);

      // SauceDemo renders no badge at all for an empty cart (see exploration artifact).
      await expect(inventoryPage.cartBadge).toHaveCount(0);

      await assertBacktraceEventsBeaconPair(sauceDemoAuthenticatedPage, () =>
        inventoryPage.addProductToCart(SAUCEDEMO_PRODUCTS.BACKPACK),
      );

      await expect(inventoryPage.cartBadge).toHaveText('1');

      await inventoryPage.openCart();

      await expect(cartPage.cartItems).toHaveCount(1);
      await expect(cartPage.cartItemNames).toHaveText([SAUCEDEMO_PRODUCTS.BACKPACK]);
    },
  );
});
