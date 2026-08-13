import { test, expect } from '../../fixtures';
import { ExamplePage } from '../../pages/example.page';

test.describe('Playwright homepage', () => {
  test('displays the homepage heading and get started link', { tag: ['@smoke', '@homepage-heading-and-get-started-link'] }, async ({ page }) => {
    const examplePage = new ExamplePage(page);
    await examplePage.open();

    await expect(examplePage.heading).toBeVisible();
    await expect(examplePage.getStartedLink).toBeVisible();
  });
});
