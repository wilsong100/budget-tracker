import { isJson } from './canonicalJson';
import { isHlc } from './hlc';
import { SCHEMA_VERSION, isRecordType, type StoredRecord } from './records';

/** Upgrades every record from one schema version to the next. Must be pure. */
export type Migration = (records: readonly StoredRecord[]) => StoredRecord[];

export interface MigrationSet {
  currentVersion: number;
  /** steps[v] upgrades version v to v + 1. */
  steps: Readonly<Record<number, Migration>>;
}

/**
 * The app's migrations. There are none yet: version 1 is the first released format.
 * When the data format changes, add steps[1] and bump SCHEMA_VERSION in records.ts.
 */
export const MIGRATIONS: MigrationSet = { currentVersion: SCHEMA_VERSION, steps: {} };

export class SchemaError extends Error {
  constructor(
    readonly reason: 'newerVersion' | 'unknownVersion',
    message: string,
  ) {
    super(message);
    this.name = 'SchemaError';
  }
}

/** Upgrades records from `fromVersion` to the current version, one step at a time. */
export function migrateRecords(
  records: readonly StoredRecord[],
  fromVersion: number,
  migrations: MigrationSet = MIGRATIONS,
): StoredRecord[] {
  if (!Number.isInteger(fromVersion) || fromVersion < 1) {
    throw new SchemaError('unknownVersion', `unknown schema version ${fromVersion}`);
  }
  if (fromVersion > migrations.currentVersion) {
    throw new SchemaError(
      'newerVersion',
      `data is from schema version ${fromVersion}, newer than this app (${migrations.currentVersion})`,
    );
  }
  let current = [...records];
  for (let version = fromVersion; version < migrations.currentVersion; version++) {
    const step = migrations.steps[version];
    if (!step)
      throw new SchemaError('unknownVersion', `no migration from schema version ${version}`);
    current = step(current);
    const bad = current.find((record) => !isValidRecord(record));
    if (bad)
      throw new SchemaError(
        'unknownVersion',
        `migration from version ${version} produced a bad record`,
      );
  }
  return current;
}

/** Checks a value has the record shape. Used on anything read from a file or a migration. */
export function isValidRecord(value: unknown): value is StoredRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r['id'] === 'string' &&
    r['id'] !== '' &&
    isRecordType(r['type']) &&
    isJson(r['data']) &&
    r['data'] !== undefined &&
    isHlc(r['hlc']) &&
    (r['deleted'] === 0 || r['deleted'] === 1) &&
    typeof r['device_id'] === 'string' &&
    r['device_id'] !== ''
  );
}
