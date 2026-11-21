import { describe, expect, it } from 'vitest';
import {
  MIGRATIONS,
  SchemaError,
  isValidRecord,
  migrateRecords,
  type MigrationSet,
} from './migrations';
import { SCHEMA_VERSION, type StoredRecord } from './records';

const HLC = '001763700000000:000000:dev';
const record = (data: StoredRecord['data']): StoredRecord => ({
  id: 'r1',
  type: 'spend',
  data,
  hlc: HLC,
  deleted: 0,
  device_id: 'dev',
});

const testSet: MigrationSet = {
  currentVersion: 3,
  steps: {
    1: (records) => records.map((r) => ({ ...r, data: { ...(r.data as object), v2: true } })),
    2: (records) => records.map((r) => ({ ...r, data: { ...(r.data as object), v3: true } })),
  },
};

describe('migrateRecords', () => {
  it('runs each step in order', () => {
    expect(migrateRecords([record({ amount: 1 })], 1, testSet)[0]!.data).toEqual({
      amount: 1,
      v2: true,
      v3: true,
    });
    expect(migrateRecords([record({ amount: 1 })], 2, testSet)[0]!.data).toEqual({
      amount: 1,
      v3: true,
    });
  });

  it('leaves current data alone', () => {
    const records = [record({ amount: 1 })];
    expect(migrateRecords(records, 3, testSet)).toEqual(records);
    expect(migrateRecords(records, SCHEMA_VERSION)).toEqual(records);
    expect(MIGRATIONS.currentVersion).toBe(SCHEMA_VERSION);
  });

  it('refuses data from a newer app', () => {
    expect(() => migrateRecords([], 4, testSet)).toThrow(SchemaError);
    try {
      migrateRecords([], 4, testSet);
    } catch (error) {
      expect((error as SchemaError).reason).toBe('newerVersion');
    }
  });

  it('refuses unknown versions and missing steps', () => {
    expect(() => migrateRecords([], 0, testSet)).toThrow(SchemaError);
    expect(() => migrateRecords([], 1.5, testSet)).toThrow(SchemaError);
    expect(() => migrateRecords([], 1, { currentVersion: 2, steps: {} })).toThrow(
      'no migration from schema version 1',
    );
  });

  it('refuses a migration that breaks records', () => {
    const broken: MigrationSet = {
      currentVersion: 2,
      steps: { 1: (rs) => rs.map((r) => ({ ...r, hlc: 'nope' })) },
    };
    expect(() => migrateRecords([record({})], 1, broken)).toThrow('produced a bad record');
  });
});

describe('isValidRecord', () => {
  it('accepts a good record and a tombstone', () => {
    expect(isValidRecord(record({ amount: 340 }))).toBe(true);
    expect(isValidRecord({ ...record(null), deleted: 1 })).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['no id', { ...record({}), id: '' }],
    ['a bad type', { ...record({}), type: 'nope' }],
    ['undefined data', { ...record({}), data: undefined }],
    ['non-JSON data', { ...record({}), data: { when: new Date(0) } }],
    ['a bad hlc', { ...record({}), hlc: 'x' }],
    ['a boolean deleted', { ...record({}), deleted: false }],
    ['no device', { ...record({}), device_id: '' }],
  ])('refuses %s', (_name, value) => {
    expect(isValidRecord(value)).toBe(false);
  });
});
