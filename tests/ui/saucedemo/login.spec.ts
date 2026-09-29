import { test, expect } from '../../../fixtures';
import { LoginPage } from '../../../pages/saucedemo/login.page';
import { InventoryPage } from '../../../pages/saucedemo/inventory.page';
import { SAUCEDEMO_USERS, INVALID_LOGIN_CASES } from '../../../data/saucedemo/saucedemo-users.data';
import { env } from '../../../config/env';
import { assertBacktraceEventsBeaconPair } from '../../../utils/network';
import { joinUrl } from '../../../utils/url';

test.describe('SauceDemo login', () => {
  test(
    'logs in with valid credentials and lands on the inventory page',
    { tag: ['@smoke', '@network-validation', '@login-valid-credentials'] },
    async ({ page }) => {
      const loginPage = new LoginPage(page);
      const inventoryPage = new InventoryPage(page);
      await assertBacktraceEventsBeaconPair(page, () => loginPage.open());

      await loginPage.login(SAUCEDEMO_USERS.standard.username, SAUCEDEMO_USERS.standard.password);

      await expect(page).toHaveURL(joinUrl(env.SAUCEDEMO_BASE_URL, 'inventory.html'));
      await expect(inventoryPage.inventoryList).toBeVisible();
    },
  );

  for (const invalidCase of INVALID_LOGIN_CASES) {
    test(
      `shows an error and stays on the login page for ${invalidCase.username}`,
      { tag: ['@regression', `@${invalidCase.tag}`] },
      async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.open();

        await loginPage.login(invalidCase.username, invalidCase.password);

        await expect(loginPage.errorMessage).toBeVisible();
        await expect(loginPage.errorMessage).toHaveText(invalidCase.expectedError);
        await expect(page).toHaveURL(joinUrl(env.SAUCEDEMO_BASE_URL));
      },
    );
  }
});
