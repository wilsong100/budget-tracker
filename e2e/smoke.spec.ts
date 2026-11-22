import { expect, test } from '@playwright/test';

test('the web app loads under /budget-planner/', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('./');

  await expect(page.getByRole('button', { name: 'Set up my budget' })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-build', 'web');
  expect(errors).toEqual([]);
});
