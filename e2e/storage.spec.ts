import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// The save and restore tests from docs/PLAN.md (Testing, Phase 2). They are the product
// promise, so they run in Chromium, WebKit and Firefox, and on the phone viewports.
const HARNESS = 'http://localhost:4174/budget-planner/dev/storage-harness.html';
const MOBILE = ['android', 'iphone'];

async function openHarness(page: Page, query = ''): Promise<void> {
  await page.goto(HARNESS + query);
  await page.locator('body[data-ready="true"]').waitFor();
}

/** Calls window.harness[name](...args) in the page. */
function call<T = unknown>(page: Page, name: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([name, args]) =>
      (window as unknown as { harness: Record<string, (...a: unknown[]) => unknown> }).harness[
        name
      ]!(...args),
    [name, args] as const,
  ) as Promise<T>;
}

const total = async (page: Page) => (await call<{ total: number }>(page, 'counts')).total;

test('500 spends are all there after a reload', async ({ page }) => {
  await openHarness(page);
  await call(page, 'addSpends', 500);
  await page.reload();
  await page.locator('body[data-ready="true"]').waitFor();
  expect(await total(page)).toBe(500);
  expect(await call(page, 'outboxSize')).toBe(500);
  await expect(page.getByTestId('counts')).toContainText('500 spends');
});

test.describe('closing the browser in the middle of a write', () => {
  test.beforeEach(() => {
    // Persistent profiles are a desktop-browser feature; the desktop projects cover each engine.
    test.skip(MOBILE.includes(test.info().project.name), 'desktop engines cover this');
  });

  async function closeMidWrite(
    launch: (dir: string) => Promise<BrowserContext>,
    dir: string,
    count: number,
    oneChange: boolean,
    waitMs: number,
  ) {
    const first = await launch(dir);
    const page = first.pages()[0] ?? (await first.newPage());
    await openHarness(page);
    await call(page, 'startSpendsWithoutWaiting', count, { oneChange });
    await page.waitForTimeout(waitMs);
    await first.close();

    const second = await launch(dir);
    const again = second.pages()[0] ?? (await second.newPage());
    await openHarness(again);
    const records = await call<unknown[]>(again, 'allRecords');
    const outbox = await call<number>(again, 'outboxSize');
    await second.close();
    // Recorded so the report shows where the write was cut off.
    test.info().annotations.push({
      type: 'records after reopening',
      description: `${records.length} of ${count}`,
    });
    return { records: records.length, outbox };
  }

  test('one big change is saved whole or not at all', async ({ playwright, browserName }, info) => {
    const launch = (dir: string) => playwright[browserName].launchPersistentContext(dir);
    const { records, outbox } = await closeMidWrite(
      launch,
      info.outputPath('profile'),
      3000,
      true,
      30,
    );
    expect([0, 3000]).toContain(records);
    expect(outbox).toBe(records);
  });

  test('many small changes stop cleanly between two changes', async ({
    playwright,
    browserName,
  }, info) => {
    const launch = (dir: string) => playwright[browserName].launchPersistentContext(dir);
    const { records, outbox } = await closeMidWrite(
      launch,
      info.outputPath('profile'),
      400,
      false,
      300,
    );
    expect(records).toBeGreaterThanOrEqual(0);
    expect(records).toBeLessThanOrEqual(400);
    // Every saved record has its outbox entry: no change was half-saved.
    expect(outbox).toBe(records);
  });
});

test('a change that fails part-way saves nothing', async ({ page }) => {
  await openHarness(page);
  const result = await page.evaluate(async () => {
    type Store = {
      put(type: string, data: unknown): Promise<{ id: string }>;
      putMany(changes: unknown[]): Promise<unknown>;
      counts(): Promise<{ total: number }>;
      outboxSize(): Promise<number>;
    };
    const store = (window as unknown as { harness: { store: Store } }).harness.store;
    const bill = await store.put('bill', { name: 'Rent' });
    const changes: unknown[] = Array.from({ length: 2000 }, (_, i) => ({
      type: 'spend',
      data: { amount: i },
    }));
    changes.push({ type: 'spend', data: {}, id: bill.id }); // fails: that id is a bill
    const error = await store.putMany(changes).then(
      () => '',
      (e: unknown) => String(e),
    );
    return { error, total: (await store.counts()).total, outbox: await store.outboxSize() };
  });
  expect(result).toEqual({
    error: expect.stringContaining('is a bill, not a spend'),
    total: 1,
    outbox: 1,
  });
});

test('export a backup, clear site data, restore: the count and checksum match', async ({
  page,
}) => {
  await openHarness(page);
  await call(page, 'addSpends', 120, { oneChange: true });
  const before = { total: await total(page), digest: await call<string>(page, 'digest') };
  const text = await call<string>(page, 'exportText');

  await call(page, 'clearSiteData');
  await openHarness(page);
  await expect(page.getByTestId('startup-state')).toContainText('Fresh');

  const result = await call<{ ok: boolean; description: string }>(page, 'restoreTexts', [text]);
  expect(result).toMatchObject({ ok: true, description: expect.stringContaining('120 spends') });
  expect(await total(page)).toBe(before.total);
  expect(await call(page, 'digest')).toBe(before.digest);
});

test('with the database cleared but the marker kept, it says the budget is missing', async ({
  page,
}) => {
  await openHarness(page);
  await call(page, 'addSpends', 3);
  const text = await call<string>(page, 'exportText');
  await call(page, 'clearDatabaseOnly');
  await openHarness(page);

  const missing = page.getByTestId('missing');
  await expect(missing).toContainText('Your budget seems to be missing');
  await expect(missing.getByText('Restore from backup')).toBeVisible();
  await expect(missing.getByRole('button', { name: 'Reconnect sync' })).toBeVisible();
  await expect(page.getByTestId('startup-state')).toHaveCount(0);

  // Restoring from the missing screen brings the budget back.
  await missing.locator('input[type=file]').setInputFiles({
    name: 'budget-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(page.getByRole('alertdialog')).toContainText('3 spends');
  await page.getByRole('button', { name: 'Replace my budget' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Restored' })).toContainText('3 spends');
  expect(await total(page)).toBe(3);
});

test.describe('an older schema version', () => {
  test('a backup from an older version is upgraded when restored', async ({ page }) => {
    await openHarness(page);
    await call(page, 'addSpends', 10);
    const v1Backup = await call<string>(page, 'exportText');
    expect(JSON.parse(v1Backup).schemaVersion).toBe(1);
    await call(page, 'clearSiteData');

    await openHarness(page, '?schema=v2');
    const result = await call<{ ok: boolean; summary: { schemaVersion: number } }>(
      page,
      'restoreTexts',
      [v1Backup],
    );
    expect(result).toMatchObject({ ok: true, summary: { schemaVersion: 1 } });
    const records = await call<{ type: string; data: Record<string, unknown> }[]>(
      page,
      'allRecords',
    );
    expect(records).toHaveLength(10);
    for (const record of records) {
      expect(record.data).toHaveProperty('description');
      expect(record.data).not.toHaveProperty('note');
    }
  });

  test('stored data is upgraded on open, with a snapshot first, and a newer database is left alone', async ({
    page,
  }) => {
    await openHarness(page);
    await call(page, 'addSpends', 4);
    await openHarness(page, '?schema=v2');
    const records = await call<{ data: Record<string, unknown> }[]>(page, 'allRecords');
    expect(records.every((r) => 'description' in r.data)).toBe(true);
    expect(await call(page, 'snapshots')).toEqual([
      expect.objectContaining({ reason: 'migration', schemaVersion: 1, total: 4 }),
    ]);

    // Going back to the older app must not touch the newer data.
    await openHarness(page);
    expect(
      await page.evaluate(
        () => (window as unknown as { harness: { openError: string } }).harness.openError,
      ),
    ).toContain('newer version');
    await openHarness(page, '?schema=v2');
    expect(await total(page)).toBe(4);
  });
});

test('a corrupted or edited backup is refused and the budget is untouched', async ({ page }) => {
  await openHarness(page);
  await call(page, 'addSpends', 20, { oneChange: true });
  const digest = await call<string>(page, 'digest');
  const text = await call<string>(page, 'exportText');

  const edited = text.replace(/"amount": \d+/, '"amount": 999999');
  expect(edited).not.toBe(text);
  expect(await call(page, 'restoreTexts', [edited])).toMatchObject({
    ok: false,
    problem: 'checksumMismatch',
  });
  expect(await call(page, 'restoreTexts', [text.slice(0, text.length / 2)])).toMatchObject({
    ok: false,
    problem: 'notABackup',
  });
  expect(await call(page, 'digest')).toBe(digest);

  // The same through the page: a clear message, and nothing replaced.
  await page.locator('section[aria-labelledby=backup] input[type=file]').setInputFiles({
    name: 'budget-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(edited),
  });
  await expect(page.getByRole('alert')).toContainText(
    "changed or damaged since it was saved, so it can't be restored",
  );
  await expect(page.getByRole('button', { name: 'Replace my budget' })).toHaveCount(0);
  expect(await call(page, 'digest')).toBe(digest);
});

test('restoring the snapshot from 3 days ago brings back that day', async ({ page }) => {
  const day = (n: number) => new Date(Date.UTC(2026, 10, 16 + n, 10, 0, 0));
  await page.clock.setFixedTime(day(0));
  await openHarness(page);
  await call(page, 'addSpends', 10, { oneChange: true });
  for (let n = 1; n <= 4; n++) {
    await page.clock.setFixedTime(day(n));
    await call(page, 'addSpends', 5, { oneChange: true });
  }
  expect(await total(page)).toBe(30);

  // Today is 20 November. The snapshot taken on 17 November holds the budget as it stood
  // before that day's first change.
  const snapshots = await call<{ id: string; day: string; total: number }[]>(page, 'snapshots');
  const threeDaysAgo = snapshots.find((s) => s.day === '2026-11-17');
  expect(threeDaysAgo?.total).toBe(10);
  await call(page, 'restoreSnapshot', threeDaysAgo!.id);
  expect(await total(page)).toBe(10);
  expect((await call<{ reason: string; total: number }[]>(page, 'snapshots'))[0]).toMatchObject({
    reason: 'beforeRestore',
    total: 30,
  });
});

test('the linked backup file is rewritten in place (Chromium)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the File System Access API is Chromium only');
  await openHarness(page);
  await call(page, 'addSpends', 3);

  // The save dialog can't be driven from a test, so link a real file handle from the
  // origin private file system instead. The app treats it like a picked file.
  await page.evaluate(async () => {
    const dir = await navigator.storage.getDirectory();
    const handle = await dir.getFileHandle('budget-backup.json', { create: true });
    await (
      window as unknown as { harness: { linkHandle: (h: unknown) => Promise<void> } }
    ).harness.linkHandle(handle);
  });
  // Lists the folder and counts the records in each file. While Chrome rewrites a file it
  // writes to a temporary "<name>.crswap" beside it and swaps it in on close, so that copy
  // is skipped, and a read that races a write in progress returns 'busy' so the poll retries.
  const readFiles = () =>
    page.evaluate(async () => {
      const dir = (await navigator.storage.getDirectory()) as unknown as {
        entries(): AsyncIterable<[string, { getFile(): Promise<File> }]>;
      };
      const files: Record<string, number> = {};
      try {
        for await (const [name, handle] of dir.entries()) {
          if (name.endsWith('.crswap')) continue;
          files[name] = JSON.parse(await (await handle.getFile()).text()).records.length;
        }
      } catch {
        return 'busy';
      }
      return files;
    });

  expect(await call(page, 'writeLinked')).toBe(true);
  expect(await readFiles()).toEqual({ 'budget-backup.json': 3 });

  await call(page, 'addSpends', 4);
  expect(await call(page, 'writeLinked')).toBe(true);
  expect(await readFiles()).toEqual({ 'budget-backup.json': 7 });

  // The link survives a reload, and hiding the page (end of session) rewrites the file.
  await openHarness(page);
  expect(await call(page, 'linkedStatus')).toBe('ready');
  await call(page, 'addSpends', 2);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(readFiles).toEqual({ 'budget-backup.json': 9 });
});

test('the test page shows every storage health state', async ({ page }) => {
  await openHarness(page);
  const gallery = page.locator('section[aria-labelledby=gallery]');
  for (const message of [
    'Saved on this device',
    'Synced 2 min ago',
    'Not protected: turn on sync or make a backup',
    'Private window: nothing will be kept',
    "Can't save on this device",
  ]) {
    await expect(gallery.getByRole('status').filter({ hasText: message })).toBeVisible();
  }
  await expect(page.locator('section[aria-labelledby=health] [role=status]')).toBeVisible();
});
