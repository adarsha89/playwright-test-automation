import { test, expect } from '../../fixtures';
import { ExamplePage } from '../../pages/example.page';
import { applyUiMutation } from '../../utils/mutation-testing';

test.describe('Playwright homepage', () => {
  test(
    'displays the homepage heading and get started link',
    { tag: ['@p2', '@smoke', '@mutation-target', '@homepage-heading-and-get-started-link'] },
    async ({ page }) => {
      const examplePage = new ExamplePage(page);
      await examplePage.open();

      await applyUiMutation(examplePage.heading, 'hide');

      await expect(examplePage.heading).toBeVisible();
      await expect(examplePage.getStartedLink).toBeVisible();
    },
  );
});
