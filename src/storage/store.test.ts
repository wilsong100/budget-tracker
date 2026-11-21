import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseBackup, serialiseBackup } from './backup';
import { memoryMarker } from './marker';
import { SchemaError, type MigrationSet } from './migrations';
import type { StoredRecord } from './records';
import { BudgetStore, type StoreOptions } from './store';

const DAY = 86_400_000;
const START = Date.parse('2026-11-16T09:00:00Z');

let factory: IDBFactory;
let clock: number;
let open: BudgetStore[];

const options = (extra: Partial<StoreOptions> = {}): StoreOptions => ({
  name: 'test',
  now: () => clock,
  dexie: { indexedDB: factory, IDBKeyRange },
  ...extra,
});

async function openStore(extra: Partial<StoreOptions> = {}): Promise<BudgetStore> {
  const store = await BudgetStore.open(options(extra));
  open.push(store);
  return store;
}

const spend = (amount: number, note = 'coffee') => ({ amount, note });

beforeEach(() => {
  factory = new IDBFactory();
  clock = START;
  open = [];
});

afterEach(() => {
  for (const store of open) store.close();
});

describe('writing', () => {
  it('saves each change with an outbox entry, an id and a newer clock', async () => {
    const store = await openStore();
    const a = await store.put('spend', spend(340));
    const b = await store.put('spend', spend(250));
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a).toMatchObject({
      type: 'spend',
      deleted: 0,
      device_id: store.deviceId,
      data: spend(340),
    });
    expect(b.hlc > a.hlc).toBe(true);
    expect(await store.outboxSize()).toBe(2);
    expect((await store.list('spend')).map((r) => r.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('keeps the clock moving forward when the device clock goes back', async () => {
    const store = await openStore();
    const a = await store.put('spend', spend(1));
    clock -= 3_600_000;
    const b = await store.put('spend', spend(2));
    expect(b.hlc > a.hlc).toBe(true);
  });

  it('replaces a record by id', async () => {
    const store = await openStore();
    const a = await store.put('bill', { name: 'Rent' });
    await store.put('bill', { name: 'Mortgage' }, a.id);
    expect((await store.get(a.id))?.data).toEqual({ name: 'Mortgage' });
    expect((await store.counts()).total).toBe(1);
    expect(await store.outboxSize()).toBe(2);
  });

  it('saves a multi-record change all together or not at all', async () => {
    const store = await openStore();
    const bill = await store.put('bill', { name: 'Rent' });
    await expect(
      store.putMany([
        { type: 'spend', data: spend(1) },
        { type: 'spend', data: spend(2), id: bill.id }, // wrong type: fails inside the transaction
      ]),
    ).rejects.toThrow(TypeError);
    expect((await store.counts()).counts).toEqual({ bill: 1 });
    expect(await store.outboxSize()).toBe(1);
  });

  it('does nothing for an empty change', async () => {
    const marker = memoryMarker();
    const store = await openStore({ marker });
    expect(await store.putMany([])).toEqual([]);
    expect(marker.value).toBe(false);
  });

  it('refuses data that cannot be stored exactly, before writing anything', async () => {
    const store = await openStore();
    await expect(store.put('spend', { amount: Number.NaN })).rejects.toThrow(TypeError);
    await expect(store.put('nope' as 'spend', {})).rejects.toThrow(TypeError);
    expect(await store.outboxSize()).toBe(0);
  });

  it('deletes by leaving a tombstone that syncs', async () => {
    const store = await openStore();
    const a = await store.put('spend', spend(340));
    expect(await store.remove(a.id)).toBe(true);
    expect(await store.remove(a.id)).toBe(false);
    expect(await store.remove('missing')).toBe(false);
    expect(await store.get(a.id)).toBeUndefined();
    const [tombstone] = await store.allRecords();
    expect(tombstone).toMatchObject({ id: a.id, deleted: 1, data: null });
    expect(await store.outboxSize()).toBe(2);
  });

  it('sets the data marker and tells subscribers after each commit', async () => {
    const marker = memoryMarker();
    const store = await openStore({ marker });
    const seen: string[] = [];
    const unsubscribe = store.subscribe(() => seen.push('changed'));
    expect(marker.value).toBe(false);
    await store.put('spend', spend(1));
    expect(marker.value).toBe(true);
    unsubscribe();
    await store.put('spend', spend(2));
    expect(seen).toEqual(['changed']);
  });

  it('keeps the device id across reopening', async () => {
    const first = await openStore();
    const id = first.deviceId;
    first.close();
    const second = await openStore();
    expect(second.deviceId).toBe(id);
    expect(second.name).toBe('test');
  });

  it('gives unique, ordered clocks when two tabs write at once', async () => {
    const tabA = await openStore();
    const tabB = await openStore();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => (i % 2 ? tabA : tabB).put('spend', spend(i))),
    );
    const hlcs = (await tabA.allRecords()).map((r) => r.hlc);
    expect(new Set(hlcs).size).toBe(20);
    expect(await tabA.outboxSize()).toBe(20);
  });
});

describe('snapshots', () => {
  it('takes one before the first change of each day, holding the day before', async () => {
    const store = await openStore();
    await store.put('spend', spend(1)); // day 1: nothing to snapshot yet
    await store.put('spend', spend(2));
    expect(await store.listSnapshots()).toEqual([]);
    clock += DAY;
    await store.put('spend', spend(3)); // day 2: snapshot of day 1's 2 spends
    await store.put('spend', spend(4));
    const [snapshot] = await store.listSnapshots();
    expect(await store.listSnapshots()).toHaveLength(1);
    expect(snapshot).toMatchObject({
      day: '2026-11-17',
      reason: 'daily',
      total: 2,
      counts: { spend: 2 },
    });
  });

  it('restores a snapshot from 3 days ago, after keeping a copy of today', async () => {
    const store = await openStore();
    for (let day = 0; day < 5; day++) {
      clock = START + day * DAY;
      await store.putMany(
        Array.from({ length: 5 }, (_, i) => ({
          type: 'spend' as const,
          data: spend(day * 10 + i),
        })),
      );
    }
    expect((await store.counts()).total).toBe(25);
    const threeDaysAgo = (await store.listSnapshots()).find((s) => s.day === '2026-11-17');
    expect(threeDaysAgo?.total).toBe(5);
    await store.restoreSnapshot(threeDaysAgo!.id);
    expect((await store.counts()).total).toBe(5);
    const latest = (await store.listSnapshots())[0];
    expect(latest).toMatchObject({ reason: 'beforeRestore', total: 25 });
    // Undo the undo.
    await store.restoreSnapshot(latest!.id);
    expect((await store.counts()).total).toBe(25);
  });

  it('marks records missing from the snapshot as deleted, so the restore syncs', async () => {
    const store = await openStore();
    const keep = await store.put('spend', spend(1));
    clock += DAY;
    const extra = await store.put('spend', spend(2));
    await store.put('spend', { amount: 999, note: 'edited' }, keep.id);
    const outboxBefore = await store.outboxSize();
    const [snapshot] = await store.listSnapshots();
    await store.restoreSnapshot(snapshot!.id);
    expect((await store.get(keep.id))?.data).toEqual(spend(1));
    expect(await store.get(extra.id)).toBeUndefined();
    expect(await store.outboxSize()).toBe(outboxBefore + 2);
  });

  it('refuses a snapshot that does not exist', async () => {
    const store = await openStore();
    await expect(store.restoreSnapshot('nope')).rejects.toThrow(RangeError);
  });

  it('prunes to one a day for a week and one a week for four weeks', async () => {
    const store = await openStore();
    for (let day = 0; day < 40; day++) {
      clock = START + day * DAY;
      await store.put('spend', spend(day));
    }
    const snapshots = await store.listSnapshots();
    expect(snapshots).toHaveLength(11);
    expect(snapshots.every((s) => s.reason === 'daily')).toBe(true);
  });
});

describe('backup and restore', () => {
  it('round-trips into an empty database with the same records', async () => {
    const store = await openStore();
    for (let i = 0; i < 50; i++) await store.put('spend', spend(i));
    await store.put('bill', { name: 'Rent' });
    await store.remove((await store.list('spend'))[0]!.id);
    const text = serialiseBackup(await store.exportBackup());
    const digest = await store.digest();

    const fresh = await openStore({ name: 'other' });
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary.counts).toEqual({ spend: 49, bill: 1 });
    await fresh.restoreRecords(parsed.records);
    expect(await fresh.digest()).toBe(digest);
    expect(await fresh.outboxSize()).toBe(51); // 50 spends (one now a tombstone) and a bill
    // New changes on the fresh device are newer than anything restored.
    const after = await fresh.put('spend', spend(1));
    expect((await fresh.allRecords()).every((r) => r.id === after.id || r.hlc < after.hlc)).toBe(
      true,
    );
  });

  it('restores over existing data with a snapshot first', async () => {
    const store = await openStore();
    await store.put('spend', spend(1));
    const text = serialiseBackup(await store.exportBackup());
    await store.put('spend', spend(2));
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error('backup should parse');
    await store.restoreRecords(parsed.records);
    expect((await store.counts()).total).toBe(1);
    expect((await store.listSnapshots())[0]).toMatchObject({ reason: 'beforeRestore', total: 2 });
  });

  it('records when a backup was made', async () => {
    const store = await openStore();
    expect(await store.getMeta('lastBackupAt')).toBeUndefined();
    await store.recordBackupMade();
    expect(await store.getMeta('lastBackupAt')).toBe(START);
    await store.setMeta('persisted', true);
    expect(await store.getMeta('persisted')).toBe(true);
  });
});

describe('schema upgrades', () => {
  const v2: MigrationSet = {
    currentVersion: 2,
    steps: {
      1: (records) =>
        records.map((r): StoredRecord => {
          if (r.type !== 'spend' || r.deleted) return r;
          const { note, ...rest } = r.data as { note: string; amount: number };
          return { ...r, data: { ...rest, description: note } };
        }),
    },
  };

  it('upgrades stored data on open, after a snapshot of the old data', async () => {
    const v1Store = await openStore();
    await v1Store.put('spend', spend(340, 'coffee'));
    v1Store.close();

    const v2Store = await openStore({ migrations: v2 });
    const [record] = await v2Store.list('spend');
    expect(record?.data).toEqual({ amount: 340, description: 'coffee' });
    const [snapshot] = await v2Store.listSnapshots();
    expect(snapshot).toMatchObject({ reason: 'migration', schemaVersion: 1, total: 1 });
    expect(await v2Store.getMeta('schemaVersion')).toBe(2);

    // Restoring the pre-upgrade snapshot upgrades it again.
    await v2Store.put('spend', spend(1, 'tea'));
    await v2Store.restoreSnapshot(snapshot!.id);
    expect((await v2Store.list('spend')).map((r) => r.data)).toEqual([
      { amount: 340, description: 'coffee' },
    ]);
  });

  it('upgrades an empty database without a snapshot', async () => {
    (await openStore()).close();
    const store = await openStore({ migrations: v2 });
    expect(await store.listSnapshots()).toEqual([]);
  });

  it('refuses to open data saved by a newer app, leaving it untouched', async () => {
    const v2Store = await openStore({ migrations: v2 });
    await v2Store.put('spend', { amount: 1, description: 'x' });
    v2Store.close();
    await expect(openStore()).rejects.toThrow(SchemaError);
    const again = await openStore({ migrations: v2 });
    expect((await again.counts()).total).toBe(1);
  });

  it('can delete the whole database', async () => {
    const store = await openStore();
    await store.put('spend', spend(1));
    store.close();
    await BudgetStore.deleteDatabase('test', { indexedDB: factory, IDBKeyRange });
    const fresh = await openStore();
    expect((await fresh.counts()).total).toBe(0);
  });
});
