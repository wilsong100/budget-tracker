import { describe, expect, it } from 'vitest';
import {
  BACKUP_MESSAGES,
  createBackup,
  digestRecords,
  parseBackup,
  pickNewestBackup,
  serialiseBackup,
  summariseRecords,
} from './backup';
import { encodeHlc } from './hlc';
import type { MigrationSet } from './migrations';
import type { StoredRecord } from './records';

const T = Date.parse('2026-11-03T10:00:00Z');
const rec = (
  id: string,
  type: StoredRecord['type'],
  at: number,
  extra: Partial<StoredRecord> = {},
): StoredRecord => ({
  id,
  type,
  data: { amount: 340, note: 'coffee' },
  hlc: encodeHlc({ wall: at, counter: 0, node: 'dev' }),
  deleted: 0,
  device_id: 'dev',
  ...extra,
});

const records = [
  rec('b', 'bill', T - 1000),
  rec('a', 'spend', T),
  rec('c', 'spend', T - 5000),
  rec('d', 'spend', T + 1, { deleted: 1, data: null }),
];
const file = createBackup({
  records,
  schemaVersion: 1,
  exportedAt: Date.parse('2026-11-21T09:30:00Z'),
  deviceId: 'dev',
});
const text = serialiseBackup(file);

describe('createBackup', () => {
  it('carries a format, schema version, export date and checksum', () => {
    expect(file).toMatchObject({
      format: 'budget-backup',
      schemaVersion: 1,
      exportedAt: '2026-11-21T09:30:00.000Z',
    });
    expect(file.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(file.records.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('gives the same checksum for the same data in any order', () => {
    const again = createBackup({
      records: [...records].reverse(),
      schemaVersion: 1,
      exportedAt: Date.parse('2026-11-21T09:30:00Z'),
      deviceId: 'dev',
    });
    expect(again.checksum).toBe(file.checksum);
  });
});

describe('parseBackup', () => {
  it('reads a good backup and summarises it', () => {
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.records).toHaveLength(4);
    expect(parsed.summary).toEqual({
      counts: { spend: 2, bill: 1 },
      total: 3,
      lastChange: '2026-11-03',
      exportedAt: '2026-11-21T09:30:00.000Z',
      schemaVersion: 1,
    });
  });

  it.each([
    ['not JSON', 'not json at all'],
    ['truncated', text.slice(0, 200)],
    ['JSON but not a backup', JSON.stringify({ hello: 'world' })],
    ['null', 'null'],
  ])('says a %s file is not a backup', (_name, input) => {
    expect(parseBackup(input)).toEqual({
      ok: false,
      problem: 'notABackup',
      message: BACKUP_MESSAGES.notABackup,
    });
  });

  it('refuses an edited amount', () => {
    const edited = text.replace('"amount": 340', '"amount": 99999');
    expect(edited).not.toBe(text);
    expect(parseBackup(edited)).toMatchObject({ ok: false, problem: 'checksumMismatch' });
  });

  it('refuses an edited export date', () => {
    const edited = text.replace('2026-11-21T09:30:00.000Z', '2026-11-22T09:30:00.000Z');
    expect(parseBackup(edited)).toMatchObject({ ok: false, problem: 'checksumMismatch' });
  });

  it('refuses a removed record', () => {
    const json = JSON.parse(text);
    json.records.pop();
    expect(parseBackup(JSON.stringify(json))).toMatchObject({
      ok: false,
      problem: 'checksumMismatch',
    });
  });

  it.each([
    ['a missing checksum', (j: Record<string, unknown>) => delete j['checksum']],
    ['a bad export date', (j: Record<string, unknown>) => (j['exportedAt'] = 'yesterday')],
    [
      'an impossible export date',
      (j: Record<string, unknown>) => (j['exportedAt'] = '2026-13-45T99:99:99Z'),
    ],
    ['records that are not a list', (j: Record<string, unknown>) => (j['records'] = {})],
    ['a fractional version', (j: Record<string, unknown>) => (j['schemaVersion'] = 1.5)],
    ['no device', (j: Record<string, unknown>) => delete j['deviceId']],
  ])('calls a file with %s damaged', (_name, change) => {
    const json = JSON.parse(text);
    change(json);
    expect(parseBackup(JSON.stringify(json))).toMatchObject({ ok: false, problem: 'damaged' });
  });

  it('calls a file damaged when its records are bad, even with a matching checksum', () => {
    const bad = createBackup({
      records: [{ ...rec('x', 'spend', T), hlc: 'broken' }],
      schemaVersion: 1,
      exportedAt: T,
      deviceId: 'dev',
    });
    expect(parseBackup(serialiseBackup(bad))).toMatchObject({ ok: false, problem: 'damaged' });
    const dupes = createBackup({
      records: [rec('x', 'spend', T), rec('x', 'bill', T)],
      schemaVersion: 1,
      exportedAt: T,
      deviceId: 'dev',
    });
    expect(parseBackup(serialiseBackup(dupes))).toMatchObject({ ok: false, problem: 'damaged' });
  });

  it('calls a file damaged when it holds values JSON cannot', () => {
    // A checksum can't be computed over a huge exponent that becomes Infinity.
    const json = text.replace('"schemaVersion": 1', '"schemaVersion": 1, "extra": 1e999');
    expect(parseBackup(json)).toMatchObject({ ok: false, problem: 'damaged' });
  });

  it('upgrades records from an older schema version', () => {
    const v2: MigrationSet = {
      currentVersion: 2,
      steps: {
        1: (rs) => rs.map((r) => ({ ...r, data: { ...(r.data as object), upgraded: true } })),
      },
    };
    const parsed = parseBackup(text, v2);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(
      parsed.records.every((r) => (r.data as { upgraded?: boolean } | null)?.upgraded || r.deleted),
    ).toBe(true);
    expect(parsed.summary.schemaVersion).toBe(1);
  });

  it('refuses a backup from a newer app, and one with no upgrade path', () => {
    const newer = createBackup({ records, schemaVersion: 2, exportedAt: T, deviceId: 'dev' });
    expect(parseBackup(serialiseBackup(newer))).toMatchObject({
      ok: false,
      problem: 'newerVersion',
    });
    const ancient = createBackup({ records, schemaVersion: 0, exportedAt: T, deviceId: 'dev' });
    expect(parseBackup(serialiseBackup(ancient))).toMatchObject({ ok: false, problem: 'damaged' });
  });
});

describe('summariseRecords', () => {
  it('handles an empty budget', () => {
    expect(summariseRecords([], { exportedAt: 'x', schemaVersion: 1 })).toMatchObject({
      total: 0,
      lastChange: null,
    });
  });

  it('gives the last change as a London day', () => {
    // 23:30 UTC in summer is the next day in London.
    const summer = rec('s', 'spend', Date.parse('2026-06-30T23:30:00Z'));
    expect(summariseRecords([summer], { exportedAt: 'x', schemaVersion: 1 }).lastChange).toBe(
      '2026-07-01',
    );
  });
});

describe('pickNewestBackup', () => {
  const older = serialiseBackup(
    createBackup({
      records: records.slice(0, 1),
      schemaVersion: 1,
      exportedAt: T,
      deviceId: 'dev',
    }),
  );
  const newer = serialiseBackup(
    createBackup({ records, schemaVersion: 1, exportedAt: T + 60_000, deviceId: 'dev' }),
  );

  it('takes the newest valid file, ignoring bad ones', () => {
    const picked = pickNewestBackup(['junk', older, newer, older]);
    expect(picked.ok && picked.backup.exportedAt).toBe(new Date(T + 60_000).toISOString());
    const reversed = pickNewestBackup([newer, older]);
    expect(reversed.ok && reversed.records).toHaveLength(4);
  });

  it('reports the first problem when nothing is valid', () => {
    expect(pickNewestBackup(['junk', '{}'])).toMatchObject({ ok: false, problem: 'notABackup' });
    expect(pickNewestBackup([])).toMatchObject({ ok: false, problem: 'notABackup' });
  });
});

describe('digestRecords', () => {
  it('ignores order and notices any change', () => {
    expect(digestRecords([...records].reverse())).toBe(digestRecords(records));
    expect(digestRecords([{ ...records[0]!, deleted: 1 }, ...records.slice(1)])).not.toBe(
      digestRecords(records),
    );
  });
});
