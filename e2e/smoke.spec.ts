import { expect, test } from '@playwright/test';

test('the web app loads under /budget-planner/', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('./');

  await expect(page.getByRole('heading', { name: 'Budget planner' })).toBeVisible();
  await expect(page.getByTestId('build-target')).toHaveText('Build: web');
  expect(errors).toEqual([]);
});
