import type { Json } from './canonicalJson';

/**
 * The version of the record data format. Bump it with a migration in migrations.ts whenever
 * the shape of stored data changes, so old backups and old databases can be upgraded.
 */
export const SCHEMA_VERSION = 1;

export const RECORD_TYPES = [
  'spend',
  'bill',
  'pot',
  'payRule',
  'setting',
  'category',
  'debt',
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/**
 * Every record has the same sync-ready shape (docs/PLAN.md, Differentiator 3). Records are
 * never hard-deleted: deletion sets `deleted` so the change can sync to other devices.
 */
export interface StoredRecord {
  /** UUIDv7 */
  id: string;
  type: RecordType;
  data: Json;
  /** Hybrid logical clock timestamp of the last change. */
  hlc: string;
  /** 0 or 1, because IndexedDB can't index booleans. */
  deleted: 0 | 1;
  /** The device that made the last change. */
  device_id: string;
}

export function isRecordType(value: unknown): value is RecordType {
  return typeof value === 'string' && (RECORD_TYPES as readonly string[]).includes(value);
}
