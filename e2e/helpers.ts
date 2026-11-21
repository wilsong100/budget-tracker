import { expect, type Page } from '@playwright/test';

/** Saturday 21 November 2026, mid-morning in London. Payday on the 28th moves to Fri 27th. */
export const TODAY = new Date('2026-11-21T10:00:00Z');

/** Starts the app at a fixed date with time still moving, on an empty browser. */
export async function openApp(page: Page, path = './'): Promise<void> {
  await page.clock.install({ time: TODAY });
  await page.goto(path);
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
}

export interface SetupBill {
  name: string;
  amount: string;
  day: string;
}

/**
 * The four-step setup, done the way a person would: paid monthly on the 28th, £2,000 take-home,
 * £1,234.56 in the account, energy £95 on the 25th and mobile £20 on the 22nd.
 */
export async function completeSetup(
  page: Page,
  bills: SetupBill[] = [
    { name: 'Energy', amount: '95', day: '25' },
    { name: 'Mobile', amount: '20', day: '22' },
  ],
): Promise<void> {
  await page.getByRole('button', { name: 'Set up my budget' }).click();

  await expect(page.getByRole('heading', { name: 'When do you get paid?' })).toBeVisible();
  await page.getByRole('radio', { name: 'Monthly, on a date' }).check();
  await page.getByLabel('Day of the month').fill('28');
  await page.getByLabel('Take-home pay').fill('2,000');
  await expect(page.getByTestId('next-payday')).toContainText('Fri 27 Nov');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(
    page.getByRole('heading', { name: 'What’s in your current account now?' }),
  ).toBeVisible();
  await page.getByLabel('Current account balance').fill('1234.56');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'What comes out before payday?' })).toBeVisible();
  for (const bill of bills) {
    await page.getByRole('checkbox', { name: bill.name, exact: true }).check();
    await page.getByLabel(`Amount for ${bill.name}`).fill(bill.amount);
    await page.getByLabel(`Day of the month for ${bill.name}`).fill(bill.day);
  }
  await page.getByRole('button', { name: 'Show my number' }).click();
}
