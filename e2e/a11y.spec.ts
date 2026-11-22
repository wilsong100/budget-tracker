import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { completeSetup, openApp } from './helpers';

// Phase 3 acceptance: axe-core reports no serious accessibility issues, in both themes.
test.use({ viewport: { width: 390, height: 844 } });

async function expectNoSeriousIssues(page: Page, where: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) => `${where}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
    );
  expect(serious).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`every simple screen passes axe in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    await expectNoSeriousIssues(page, 'welcome');

    await page.getByRole('button', { name: 'Set up my budget' }).click();
    await expectNoSeriousIssues(page, 'setup step 1');
    await page.getByRole('button', { name: 'Back' }).click();

    await completeSetup(page);
    await page.getByText('How is this worked out?').click();
    await expectNoSeriousIssues(page, 'today');

    for (const tab of ['Spend', 'Bills', 'Pots', 'Settings']) {
      await page.getByRole('link', { name: tab }).click();
      await expect(page.getByRole('heading', { level: 1, name: tab })).toBeVisible();
      await expectNoSeriousIssues(page, tab);
    }
    await page.getByRole('checkbox', { name: 'Show advanced options' }).check();
    await expectNoSeriousIssues(page, 'advanced settings');
  });
}

test('setup works by keyboard alone', async ({ page, browserName }) => {
  // WebKit on macOS skips buttons on Tab unless "Press Tab to highlight each item" is on.
  test.skip(browserName === 'webkit', 'WebKit tab order follows a macOS setting');
  test.skip(test.info().project.name === 'android', 'touch device');
  await openApp(page);
  await page.keyboard.press('Tab');
  // Skip link, then the first real control.
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.getByRole('button', { name: 'Set up my budget' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'When do you get paid?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'When do you get paid?' })).toBeFocused();
});
