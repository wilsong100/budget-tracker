import { expect, test, type Page } from '@playwright/test';
import { completeSetup, openApp } from './helpers';

// Phase 4 acceptance: the advanced screens (Calendar, Payday view, Debt, Month review) sit
// behind the advanced toggle, and every one has an empty state.
test.use({ viewport: { width: 390, height: 844 } });

const SCREENS: [name: string, empty: string][] = [
  ['Calendar', 'Tap a day to add a bill'],
  ['Payday view', 'Add your bills'],
  ['Debt', 'Add a credit card, loan or pay-later plan'],
  ['Month review', 'Give a category a monthly plan'],
];

export async function turnOnAdvanced(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('checkbox', { name: 'Show advanced options' }).check();
  await expect(page.getByRole('navigation', { name: 'Main' })).toContainText('More');
}

export async function openAdvanced(page: Page, name: string): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click();
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test('the advanced screens stay hidden in simple mode, even by address', async ({ page }) => {
  await openApp(page);
  await completeSetup(page);
  const tabs = page.getByRole('navigation', { name: 'Main' }).getByRole('link');
  await expect(tabs).toHaveText(['Today', 'Spend', 'Bills', 'Pots']);

  for (const path of ['more', 'calendar', 'paydays', 'debt', 'review']) {
    await page.goto(`./#/${path}`);
    await expect(page.getByTestId('safe-today')).toBeVisible();
  }
});

test('with advanced on, every advanced screen opens from More and has an empty state', async ({
  page,
}) => {
  await openApp(page);
  await completeSetup(page, []);
  await turnOnAdvanced(page);

  const tabs = page.getByRole('navigation', { name: 'Main' }).getByRole('link');
  await expect(tabs).toHaveText(['Today', 'Spend', 'Bills', 'Pots', 'More']);
  // Five tabs still fit a phone: nothing spills off the side.
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);

  for (const [name, empty] of SCREENS) {
    await openAdvanced(page, name);
    await expect(page.getByTestId('empty')).toContainText(empty);
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }),
    ).toHaveAttribute('aria-current', 'page');
  }
});

test('tapping a day on the calendar adds a bill on that day', async ({ page }) => {
  await openApp(page);
  await completeSetup(page);
  await turnOnAdvanced(page);
  await openAdvanced(page, 'Calendar');

  await expect(page.getByRole('heading', { name: 'November 2026', exact: true })).toBeVisible();
  // The setup bills are on their days, and payday is marked.
  await expect(page.getByRole('button', { name: /^Wednesday 25 November.*Energy/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Friday 27 November.*payday/ })).toBeVisible();

  await page.getByRole('button', { name: /^Monday 30 November/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add a bill' })).toBeVisible();
  await expect(page.getByLabel('Day of the month')).toHaveValue('30');
  await page.getByLabel('Name').fill('Gym');
  await page.getByLabel('Amount').fill('30');
  await page.getByRole('button', { name: 'Save bill' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Monday 30 November.*Gym/ })).toBeVisible();
  await expect(page.getByTestId('month-bills')).toContainText('Gym');

  // A month on, the monthly bills repeat.
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByRole('heading', { name: 'December 2026', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Wednesday 30 December.*Gym/ })).toBeVisible();

  await page.getByRole('link', { name: 'Bills' }).click();
  await expect(page.getByTestId('bill-list')).toContainText('Gym');
});

test('the payday view shows what each payday covers', async ({ page }) => {
  await openApp(page);
  await completeSetup(page);
  await turnOnAdvanced(page);
  await openAdvanced(page, 'Payday view');

  // Fri 27 Nov covers 28 Nov to Thu 24 Dec (28 Dec is a bank holiday): only Mobile on the 22nd.
  const first = page.getByTestId('payday').first();
  await expect(first).toContainText('Fri 27 Nov');
  await expect(first).toContainText('Thu 24 Dec');
  await expect(first).toContainText('Mobile');
  await expect(first).not.toContainText('Energy');
  await expect(first).toContainText('£1,980.00 left');

  // Thu 24 Dec covers Energy on Christmas Day, Mobile and Energy in January.
  const second = page.getByTestId('payday').nth(1);
  await expect(second).toContainText('Thu 24 Dec');
  await expect(second).toContainText('£210.00');
});

test('the debt plan gives a debt-free date and the interest saved by overpaying', async ({
  page,
}) => {
  await openApp(page);
  await completeSetup(page);
  await turnOnAdvanced(page);
  await openAdvanced(page, 'Debt');

  await page.getByRole('button', { name: 'Add a debt' }).click();
  await page.getByLabel('Name').fill('Credit card');
  await page.getByLabel('Balance owed').fill('1,200');
  await page.getByLabel('Interest rate (APR)').fill('24.9');
  await page.getByLabel('Minimum payment').fill('36');
  await page.getByRole('button', { name: 'Save debt' }).click();
  await expect(page.getByTestId('debt-list')).toContainText('Credit card');
  await expect(page.getByTestId('debt-list')).toContainText('24.9% APR');

  // With only the minimums set aside, the plan uses them.
  await page.getByLabel('Paid towards debts each month').fill('100');
  await page.getByLabel('Paid towards debts each month').blur();
  const plan = page.getByTestId('debt-plan');
  await expect(plan).toContainText('Debt-free by January 2028');
  await expect(plan).toContainText('£194.32 in interest');
  await expect(plan).toContainText('Paying only the minimums: debt-free by September 2031');
  await expect(plan).toContainText('saves £668.16 in interest');

  // Too little to cover the minimums is said plainly.
  await page.getByLabel('Paid towards debts each month').fill('20');
  await page.getByLabel('Paid towards debts each month').blur();
  await expect(plan).toContainText('less than the minimum payments');

  // Saved as it went.
  await page.reload();
  await expect(page.getByLabel('Paid towards debts each month')).toHaveValue('20');
});

test('the user can choose their own order for paying debts off', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await turnOnAdvanced(page);
  await openAdvanced(page, 'Debt');
  await expect(page.getByTestId('debt-list').getByRole('listitem')).toHaveCount(2);

  // Own order starts from the avalanche order: the dearer credit card first.
  await page.getByRole('radio', { name: /Highest interest first/ }).check();
  await page.getByRole('radio', { name: /My own order/ }).check();
  const order = page.getByTestId('debt-order').getByRole('listitem');
  await expect(order).toHaveCount(2);
  await expect(order.first()).toContainText('Credit card');
  await page.getByRole('button', { name: 'Move Car loan up' }).click();
  await expect(order.first()).toContainText('Car loan');

  await page.reload();
  await expect(page.getByRole('radio', { name: /My own order/ })).toBeChecked();
  await expect(order.first()).toContainText('Car loan');
  await expect(page.getByTestId('debt-plan')).toContainText('Debt-free by');
});

test('the month review compares planned with actual spending by category', async ({ page }) => {
  await openApp(page);
  await completeSetup(page);
  await page.getByRole('link', { name: 'Spend' }).click();
  await page.getByLabel('Log a spend').fill('Tesco 23.10');
  await page.getByLabel('Log a spend').press('Enter');
  await page.getByLabel('Category for Tesco', { exact: true }).selectOption('Groceries');

  await turnOnAdvanced(page);
  await openAdvanced(page, 'Month review');
  await expect(page.getByRole('heading', { name: 'November 2026', exact: true })).toBeVisible();
  await expect(page.getByTestId('review')).toContainText('Groceries');
  await expect(page.getByTestId('review')).toContainText('£23.10');

  await page.getByText('Set monthly plans').click();
  await page.getByLabel('Monthly plan for Groceries').fill('300');
  await page.getByLabel('Monthly plan for Groceries').blur();
  const row = page.getByTestId('review').getByRole('listitem').filter({ hasText: 'Groceries' });
  await expect(row).toContainText('£23.10 of £300.00');
  await expect(row).toContainText('£276.90 left');

  // A plan survives renaming the category in Settings.
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByText('Spending categories').click();
  await page.getByLabel('Rename Groceries').fill('Food shop');
  await page.getByLabel('Rename Groceries').blur();
  await openAdvanced(page, 'Month review');
  await expect(
    page.getByTestId('review').getByRole('listitem').filter({ hasText: 'Food shop' }),
  ).toContainText('£23.10 of £300.00');

  // The month before had nothing.
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.getByRole('heading', { name: 'October 2026', exact: true })).toBeVisible();
  await expect(page.getByTestId('review')).toContainText('£0.00 of £300.00');
});

test('turning advanced off hides the screens and keeps their data', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await turnOnAdvanced(page);
  await openAdvanced(page, 'Debt');
  await expect(page.getByTestId('debt-list').getByRole('listitem')).toHaveCount(2);

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('checkbox', { name: 'Show advanced options' }).uncheck();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText([
    'Today',
    'Spend',
    'Bills',
    'Pots',
  ]);
  await page.getByRole('checkbox', { name: 'Show advanced options' }).check();
  await openAdvanced(page, 'Debt');
  await expect(page.getByTestId('debt-list').getByRole('listitem')).toHaveCount(2);
});
