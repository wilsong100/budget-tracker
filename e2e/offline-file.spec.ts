import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The Etsy product is one HTML file opened from disk, with no server and no network.
const OFFLINE_FILE = pathToFileURL(resolve('dist/offline/budget.html')).href;

test('the offline file opens from disk with no network', async ({ page, context }) => {
  // The offline file is desktop only (docs/PLAN.md); phones use the hosted app.
  test.skip(test.info().project.name === 'android' || test.info().project.name === 'iphone');

  const requests: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('file:')) requests.push(request.url());
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.setOffline(true);

  await page.goto(OFFLINE_FILE);

  await expect(page.getByRole('button', { name: 'Set up my budget' })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-build', 'offline');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
