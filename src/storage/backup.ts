import { todayInLondon, type IsoDate } from '../domain';
import { canonicalJson } from './canonicalJson';
import { hlcWall } from './hlc';
import {
  MIGRATIONS,
  SchemaError,
  isValidRecord,
  migrateRecords,
  type MigrationSet,
} from './migrations';
import type { RecordType, StoredRecord } from './records';
import { sha256Hex } from './sha256';

export const BACKUP_FORMAT = 'budget-backup';
export const BACKUP_FILE_NAME = 'budget-backup.json';

/** The one backup format: budget-backup.json. */
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  /** ISO 8601 instant, e.g. 2026-11-21T09:30:00.000Z */
  exportedAt: string;
  deviceId: string;
  records: StoredRecord[];
  /** "sha256:<hex>" of the canonical JSON of every other field. */
  checksum: string;
}

export interface BackupSummary {
  /** Live (not deleted) records by type. */
  counts: Partial<Record<RecordType, number>>;
  total: number;
  /** The London day of the newest change, or null for an empty backup. */
  lastChange: IsoDate | null;
  exportedAt: string;
  schemaVersion: number;
}

export type BackupProblem = 'notABackup' | 'checksumMismatch' | 'newerVersion' | 'damaged';

export type ParsedBackup =
  | { ok: true; backup: BackupFile; records: StoredRecord[]; summary: BackupSummary }
  | { ok: false; problem: BackupProblem; message: string };

export const BACKUP_MESSAGES: Record<BackupProblem, string> = {
  notABackup: "This file isn't a budget backup. Choose the file called budget-backup.json.",
  checksumMismatch:
    "This backup has been changed or damaged since it was saved, so it can't be restored. Your budget hasn't been touched.",
  newerVersion:
    'This backup was made by a newer version of the budget planner. Reload the page to update, then try again.',
  damaged: "This backup is damaged and can't be restored. Your budget hasn't been touched.",
};

function checksumOf(file: Omit<BackupFile, 'checksum'>): string {
  return `sha256:${sha256Hex(canonicalJson(file))}`;
}

export function createBackup(input: {
  records: readonly StoredRecord[];
  schemaVersion: number;
  exportedAt: number;
  deviceId: string;
}): BackupFile {
  const body: Omit<BackupFile, 'checksum'> = {
    format: BACKUP_FORMAT,
    schemaVersion: input.schemaVersion,
    exportedAt: new Date(input.exportedAt).toISOString(),
    deviceId: input.deviceId,
    records: [...input.records].sort((a, b) => (a.id < b.id ? -1 : 1)),
  };
  return { ...body, checksum: checksumOf(body) };
}

export function serialiseBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 1) + '\n';
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function fail(problem: BackupProblem): ParsedBackup {
  return { ok: false, problem, message: BACKUP_MESSAGES[problem] };
}

/** Checks a backup file's format, checksum and schema version, then upgrades its records. */
export function parseBackup(text: string, migrations: MigrationSet = MIGRATIONS): ParsedBackup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail('notABackup');
  }
  if (
    typeof json !== 'object' ||
    json === null ||
    (json as Record<string, unknown>)['format'] !== BACKUP_FORMAT
  ) {
    return fail('notABackup');
  }
  const file = json as Record<string, unknown>;
  const { schemaVersion, exportedAt, deviceId, records, checksum } = file;
  if (
    !Number.isInteger(schemaVersion) ||
    typeof exportedAt !== 'string' ||
    !ISO_INSTANT.test(exportedAt) ||
    Number.isNaN(Date.parse(exportedAt)) ||
    typeof deviceId !== 'string' ||
    !Array.isArray(records) ||
    typeof checksum !== 'string'
  ) {
    return fail('damaged');
  }
  const body: Record<string, unknown> = { ...file };
  delete body['checksum'];
  let expected: string;
  try {
    expected = checksumOf(body as unknown as Omit<BackupFile, 'checksum'>);
  } catch {
    return fail('damaged');
  }
  if (expected !== checksum) return fail('checksumMismatch');
  if (!records.every(isValidRecord)) return fail('damaged');
  if (new Set(records.map((r) => r.id)).size !== records.length) return fail('damaged');

  let migrated: StoredRecord[];
  try {
    migrated = migrateRecords(records, schemaVersion as number, migrations);
  } catch (error) {
    return fail(
      error instanceof SchemaError && error.reason === 'newerVersion' ? 'newerVersion' : 'damaged',
    );
  }
  const backup = file as unknown as BackupFile;
  return { ok: true, backup, records: migrated, summary: summariseRecords(migrated, backup) };
}

export function summariseRecords(
  records: readonly StoredRecord[],
  meta: { exportedAt: string; schemaVersion: number },
): BackupSummary {
  const counts: Partial<Record<RecordType, number>> = {};
  let newest = -1;
  for (const record of records) {
    newest = Math.max(newest, hlcWall(record.hlc));
    if (record.deleted) continue;
    counts[record.type] = (counts[record.type] ?? 0) + 1;
  }
  return {
    counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    lastChange: newest < 0 ? null : todayInLondon(newest),
    exportedAt: meta.exportedAt,
    schemaVersion: meta.schemaVersion,
  };
}

/**
 * Several files dropped at once: the newest valid backup by export time wins.
 * If none is valid, the first file's problem is reported.
 */
export function pickNewestBackup(
  texts: readonly string[],
  migrations: MigrationSet = MIGRATIONS,
): ParsedBackup {
  const parsed = texts.map((text) => parseBackup(text, migrations));
  const valid = parsed.filter((p): p is Extract<ParsedBackup, { ok: true }> => p.ok);
  if (valid.length === 0) return parsed[0] ?? fail('notABackup');
  return valid.reduce((best, p) =>
    Date.parse(p.backup.exportedAt) > Date.parse(best.backup.exportedAt) ? p : best,
  );
}

/** A fingerprint of the records alone, to check two copies of a budget hold the same data. */
export function digestRecords(records: readonly StoredRecord[]): string {
  return sha256Hex(canonicalJson([...records].sort((a, b) => (a.id < b.id ? -1 : 1))));
}
