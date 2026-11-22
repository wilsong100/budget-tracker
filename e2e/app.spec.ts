import { expect, test } from '@playwright/test';
import { completeSetup, openApp } from './helpers';

// Phase 3 acceptance: setup reaches the safe-to-spend number on a phone-sized screen.
test.use({ viewport: { width: 390, height: 844 } });

test('setup takes a new user to their safe-to-spend number', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openApp(page);

  await expect(page.getByRole('heading', { level: 1 })).toContainText('spend');
  await completeSetup(page);

  // £1,234.56 − £95 − £20, over the 6 days to Fri 27 Nov, rounded down.
  await expect(page.getByTestId('safe-today')).toHaveText('£186.59');
  await expect(page.getByTestId('payday-line')).toContainText('6 days until payday');
  await expect(page.getByTestId('payday-line')).toContainText('Fri 27 Nov');

  await page.getByText('How is this worked out?').click();
  const breakdown = page.getByTestId('breakdown');
  await expect(breakdown).toContainText('In your account now');
  await expect(breakdown).toContainText('£1,234.56');
  await expect(breakdown).toContainText('Mobile');
  await expect(breakdown).toContainText('−£20.00');
  await expect(breakdown).toContainText('Energy');
  await expect(breakdown).toContainText('£1,119.56');

  // Saved as it went: a reload goes straight back to the number, not to setup.
  await page.reload();
  await expect(page.getByTestId('safe-today')).toHaveText('£186.59');
  expect(errors).toEqual([]);
});

test('simple mode has four tabs, and the advanced pages stay hidden', async ({ page }) => {
  await openApp(page);
  await completeSetup(page);

  const tabs = page.getByRole('navigation', { name: 'Main' }).getByRole('link');
  await expect(tabs).toHaveText(['Today', 'Spend', 'Bills', 'Pots']);
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
});

test('a spend takes one line, and can be undone', async ({ page }) => {
  await openApp(page);
  await completeSetup(page);

  await page.getByLabel('Log a spend').fill('coffee 3.40');
  await page.getByLabel('Log a spend').press('Enter');
  await expect(page.getByTestId('safe-today')).toHaveText('£183.19');
  await expect(page.getByTestId('spent-today')).toContainText('£3.40');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('safe-today')).toHaveText('£186.59');

  // Quick amounts log in one tap, on the Spend tab too.
  await page.getByRole('link', { name: 'Spend' }).click();
  await page.getByRole('button', { name: 'Log £5' }).click();
  await expect(page.getByTestId('spend-list')).toContainText('£5.00');
  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByTestId('safe-today')).toHaveText('£181.59');
});

test('categories are suggested from earlier spends', async ({ page }) => {
  await openApp(page);
  await completeSetup(page);
  await page.getByRole('link', { name: 'Spend' }).click();

  await page.getByLabel('Log a spend').fill('Tesco 23.10');
  await page.getByLabel('Log a spend').press('Enter');
  await page.getByLabel('Category for Tesco', { exact: true }).selectOption('Groceries');
  await expect(page.getByLabel('Category for Tesco', { exact: true })).toHaveValue('groceries');

  await page.getByLabel('Log a spend').fill('tesco 4.20');
  await page.getByLabel('Log a spend').press('Enter');
  await expect(page.getByLabel('Category for tesco', { exact: true })).toHaveValue('groceries');
});

test('every simple screen has an empty state that says what to do next', async ({ page }) => {
  await openApp(page);
  await completeSetup(page, []);

  await page.getByRole('link', { name: 'Spend' }).click();
  await expect(page.getByTestId('empty')).toContainText('Type what you spent');
  await page.getByRole('link', { name: 'Bills' }).click();
  await expect(page.getByTestId('empty')).toContainText('Add the bills');
  await page.getByRole('link', { name: 'Pots' }).click();
  await expect(page.getByTestId('empty')).toContainText('pot');
});

test('a bill can be added, ticked off as paid and deleted', async ({ page }) => {
  await openApp(page);
  await completeSetup(page, []);
  await expect(page.getByTestId('safe-today')).toHaveText('£205.76'); // £1,234.56 over 6 days

  await page.getByRole('link', { name: 'Bills' }).click();
  await page.getByRole('button', { name: 'Add a bill' }).click();
  await page.getByLabel('Name').fill('Gym');
  await page.getByLabel('Amount').fill('30');
  await page.getByLabel('How often').selectOption('monthly');
  await page.getByLabel('Day of the month').fill('24');
  await page.getByRole('button', { name: 'Save bill' }).click();
  await expect(page.getByTestId('bill-list')).toContainText('Gym');
  await expect(page.getByTestId('bill-list')).toContainText('Tue 24 Nov');

  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByTestId('safe-today')).toHaveText('£200.76');
  const tick = page.getByRole('checkbox', { name: 'Mark Gym on Tue 24 Nov as paid' });
  await tick.check();
  // Paid already left the account, so the number doesn't change, and the row stays ticked.
  await expect(tick).toBeChecked();
  await expect(page.getByTestId('safe-today')).toHaveText('£200.76');
  await tick.uncheck();
  await expect(tick).not.toBeChecked();
  await expect(page.getByTestId('safe-today')).toHaveText('£200.76');

  await page.getByRole('link', { name: 'Bills' }).click();
  await page.getByRole('button', { name: 'Edit Gym' }).click();
  await page.getByRole('button', { name: 'Delete bill' }).click();
  await expect(page.getByTestId('empty')).toBeVisible();
});

test('a pot shows its monthly share and progress', async ({ page }) => {
  await openApp(page);
  await completeSetup(page, []);
  await page.getByRole('link', { name: 'Pots' }).click();
  await page.getByRole('button', { name: 'Add a pot' }).click();
  await page.getByLabel('Name').fill('Holiday');
  await page.getByLabel('Target').fill('600');
  await page.getByLabel('Saved so far').fill('100');
  await page.getByLabel('Needed by').fill('2027-05-31');
  await page.getByRole('button', { name: 'Save pot' }).click();

  const pot = page.getByTestId('pot-list');
  await expect(pot).toContainText('Holiday');
  await expect(pot).toContainText('£100.00 of £600.00');
  // £500 over the 7 saving dates, each payday's date (the 28th), from 28 Nov to 28 May.
  await expect(pot).toContainText('£71.43 a month');
});

test('example numbers can be tried and wiped in one tap', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await expect(page.getByTestId('example-banner')).toBeVisible();
  await expect(page.getByTestId('safe-today')).toBeVisible();

  await page.getByRole('button', { name: 'Clear the example' }).click();
  await expect(page.getByRole('button', { name: 'Set up my budget' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Set up my budget' })).toBeVisible();
});

test('advanced settings appear only when switched on, and nothing is lost', async ({ page }) => {
  await openApp(page);
  await completeSetup(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByLabel('Buffer')).toHaveCount(0);

  await page.getByRole('checkbox', { name: 'Show advanced options' }).check();
  await page.getByLabel('Buffer').fill('19.56');
  await page.getByLabel('Buffer').blur();
  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByTestId('safe-today')).toHaveText('£183.33'); // (1,119.56 − 19.56) ÷ 6

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('checkbox', { name: 'Show advanced options' }).uncheck();
  await page.getByRole('link', { name: 'Today' }).click();
  await expect(page.getByTestId('safe-today')).toHaveText('£183.33');
});

test('the balance can be updated from Today', async ({ page }) => {
  await openApp(page);
  await completeSetup(page);
  await page.getByRole('button', { name: 'Update balance' }).click();
  await page.getByLabel('Current account balance').fill('600');
  await page.getByRole('button', { name: 'Save balance' }).click();
  await expect(page.getByTestId('safe-today')).toHaveText('£80.83'); // (600 − 115) ÷ 6
});

test('the storage chip is always on screen', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('storage-chip')).toBeVisible();
  await completeSetup(page);
  await expect(page.getByTestId('storage-chip')).toBeVisible();
});

test('a wiped database shows the missing-budget screen, not setup', async ({ page }) => {
  await openApp(page);
  await completeSetup(page);
  await expect(page.getByTestId('safe-today')).toBeVisible();
  await page.evaluate(async () => {
    // The app's open connection closes itself when another asks to delete the database.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('budget-planner');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Your budget seems to be missing' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore from backup' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set up my budget' })).toHaveCount(0);
});

test('the dark theme can be chosen in Settings', async ({ page }) => {
  await openApp(page);
  await completeSetup(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Dark' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
