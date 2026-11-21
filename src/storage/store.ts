import Dexie, { type DexieOptions, type Table } from 'dexie';
import { todayInLondon } from '../domain';
import { createBackup, digestRecords, type BackupFile } from './backup';
import { canonicalJson, type Json } from './canonicalJson';
import { decodeHlc, encodeHlc, receiveHlc, tickHlc, type Hlc } from './hlc';
import type { DataMarker } from './marker';
import { MIGRATIONS, SchemaError, migrateRecords, type MigrationSet } from './migrations';
import { isRecordType, type RecordType, type StoredRecord } from './records';
import { snapshotIdsToDelete, type SnapshotInfo, type SnapshotReason } from './snapshots';
import { cryptoRandomBytes, uuidv7, type RandomBytes } from './uuid';

export const DB_NAME = 'budget-planner';

/** One entry per local change, written in the same transaction. Sync (Phase 6) drains it. */
export interface OutboxEntry {
  seq?: number;
  recordId: string;
  hlc: string;
}

export type MetaKey =
  | 'deviceId'
  | 'hlc'
  | 'schemaVersion'
  | 'lastSnapshotDay'
  | 'lastBackupAt'
  | 'backupSnoozedUntil'
  | 'persisted'
  | 'linkedBackupFile';

interface MetaRow {
  key: MetaKey;
  value: unknown;
}

interface SnapshotRow extends SnapshotInfo {
  schemaVersion: number;
  counts: Partial<Record<RecordType, number>>;
  total: number;
  digest: string;
}

interface SnapshotRecordsRow {
  id: string;
  records: StoredRecord[];
}

export interface SnapshotSummary extends SnapshotInfo {
  counts: Partial<Record<RecordType, number>>;
  total: number;
  schemaVersion: number;
}

class BudgetDatabase extends Dexie {
  records!: Table<StoredRecord, string>;
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaRow, MetaKey>;
  snapshots!: Table<SnapshotRow, string>;
  snapshotRecords!: Table<SnapshotRecordsRow, string>;

  constructor(name: string, options?: DexieOptions) {
    super(name, options);
    this.version(1).stores({
      records: 'id, [type+deleted]',
      outbox: '++seq, recordId',
      meta: 'key',
      snapshots: 'id, day',
      snapshotRecords: 'id',
    });
  }
}

export interface StoreOptions {
  name?: string;
  now?: () => number;
  random?: RandomBytes;
  migrations?: MigrationSet;
  /** Set after every successful write, so a wiped database can be noticed. */
  marker?: DataMarker;
  /** For tests: an IndexedDB implementation other than the browser's. */
  dexie?: Pick<DexieOptions, 'indexedDB' | 'IDBKeyRange'>;
}

export interface Change {
  type: RecordType;
  data: Json;
  /** Leave out to create a record; give an existing id to replace its data. */
  id?: string;
}

/** A write to issue inside a transaction. */
type Write = () => Promise<unknown>;

/**
 * Issues every write of a transaction at once and waits for them together.
 *
 * Writes must never be awaited one by one. IndexedDB commits a transaction as soon as it has
 * no requests pending, and if the page is torn down between two awaited writes (a closed tab,
 * a killed browser) no further request is ever made, so the browser commits the writes done
 * so far: half a change. Firefox was seen doing exactly that in the close-mid-write test.
 * With every request queued in one synchronous burst, the transaction holds all of them or
 * none, so it commits whole or is aborted.
 */
function issue(writes: readonly Write[]): Promise<unknown> {
  return Promise.all(writes.map((write) => write()));
}

function countLive(records: readonly StoredRecord[]): {
  counts: Partial<Record<RecordType, number>>;
  total: number;
} {
  const counts: Partial<Record<RecordType, number>> = {};
  let total = 0;
  for (const record of records) {
    if (record.deleted) continue;
    counts[record.type] = (counts[record.type] ?? 0) + 1;
    total++;
  }
  return { counts, total };
}

const sameContent = (a: StoredRecord, b: StoredRecord) =>
  a.type === b.type && a.deleted === b.deleted && canonicalJson(a.data) === canonicalJson(b.data);

/**
 * The budget's local database. Every change is one IndexedDB transaction that writes the
 * records, their outbox entries and the clock together, and resolves only after it commits:
 * the UI updates when the promise resolves, never before.
 *
 * Each transaction reads what it needs first, then issues all its writes at once (see issue).
 */
export class BudgetStore {
  private readonly listeners = new Set<() => void>();
  private readonly channel: BroadcastChannel | null;

  private constructor(
    private readonly db: BudgetDatabase,
    readonly deviceId: string,
    private readonly now: () => number,
    private readonly random: RandomBytes,
    private readonly migrations: MigrationSet,
    private readonly marker: DataMarker | undefined,
  ) {
    this.channel =
      typeof BroadcastChannel === 'function' ? new BroadcastChannel(`${db.name}:changes`) : null;
    this.channel?.addEventListener('message', () => this.emit());
  }

  static async open(options: StoreOptions = {}): Promise<BudgetStore> {
    const now = options.now ?? Date.now;
    const random = options.random ?? cryptoRandomBytes;
    const migrations = options.migrations ?? MIGRATIONS;
    const db = new BudgetDatabase(options.name ?? DB_NAME, options.dexie);
    await db.open();
    try {
      const deviceId = await db.transaction('rw', db.meta, async () => {
        const existing = (await db.meta.get('deviceId'))?.value;
        if (typeof existing === 'string') return existing;
        const id = uuidv7(now(), random);
        await db.meta.put({ key: 'deviceId', value: id });
        return id;
      });
      const store = new BudgetStore(db, deviceId, now, random, migrations, options.marker);
      await store.upgradeStoredData();
      return store;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  static async deleteDatabase(name = DB_NAME, dexie?: StoreOptions['dexie']): Promise<void> {
    await new Dexie(name, dexie).delete();
  }

  get name(): string {
    return this.db.name;
  }

  close(): void {
    this.channel?.close();
    this.db.close();
  }

  /** Called after every committed change, here or in another tab. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private committed(): void {
    this.marker?.set();
    this.channel?.postMessage('changed');
    this.emit();
  }

  private get allTables() {
    const { records, outbox, meta, snapshots, snapshotRecords } = this.db;
    return [records, outbox, meta, snapshots, snapshotRecords];
  }

  // ---- writes ----

  /** Creates or replaces one record. */
  async put(type: RecordType, data: Json, id?: string): Promise<StoredRecord> {
    const [record] = await this.putMany([id === undefined ? { type, data } : { type, data, id }]);
    return record!;
  }

  /** Several records as one change: all are saved, or none are. */
  async putMany(changes: readonly Change[]): Promise<StoredRecord[]> {
    if (changes.length === 0) return [];
    for (const change of changes) {
      if (!isRecordType(change.type))
        throw new TypeError(`unknown record type ${String(change.type)}`);
      canonicalJson(change.data); // throws on data that can't be stored exactly
    }
    const saved = await this.db.transaction('rw', this.allTables, async () => {
      const snapshot = await this.prepareDailySnapshot();
      const ids = changes.flatMap((c) => (c.id === undefined ? [] : [c.id]));
      const existing = await this.db.records.bulkGet(ids);
      for (const [i, record] of existing.entries()) {
        const change = changes.find((c) => c.id === ids[i])!;
        if (record && record.type !== change.type) {
          throw new TypeError(`record ${record.id} is a ${record.type}, not a ${change.type}`);
        }
      }
      let clock = await this.readClock();
      const records = changes.map((change): StoredRecord => {
        clock = tickHlc(clock, this.now(), this.deviceId);
        return {
          id: change.id ?? uuidv7(this.now(), this.random),
          type: change.type,
          data: change.data,
          hlc: encodeHlc(clock),
          deleted: 0,
          device_id: this.deviceId,
        };
      });
      await issue([...snapshot, ...this.recordWrites(records), this.clockWrite(clock!)]);
      return records;
    });
    this.committed();
    return saved;
  }

  /** Deletes a record. It stays as a tombstone (data removed) so the deletion can sync. */
  async remove(id: string): Promise<boolean> {
    const removed = await this.db.transaction('rw', this.allTables, async () => {
      const snapshot = await this.prepareDailySnapshot();
      const existing = await this.db.records.get(id);
      if (!existing || existing.deleted) return false;
      const clock = tickHlc(await this.readClock(), this.now(), this.deviceId);
      const tombstone: StoredRecord = {
        ...existing,
        data: null,
        deleted: 1,
        hlc: encodeHlc(clock),
        device_id: this.deviceId,
      };
      await issue([...snapshot, ...this.recordWrites([tombstone]), this.clockWrite(clock)]);
      return true;
    });
    if (removed) this.committed();
    return removed;
  }

  /** Records plus one outbox entry each. */
  private recordWrites(records: readonly StoredRecord[]): Write[] {
    if (records.length === 0) return [];
    return [
      () => this.db.records.bulkPut([...records]),
      () => this.db.outbox.bulkAdd(records.map((r) => ({ recordId: r.id, hlc: r.hlc }))),
    ];
  }

  private async readClock(): Promise<Hlc | null> {
    const value = (await this.db.meta.get('hlc'))?.value;
    return typeof value === 'string' ? decodeHlc(value) : null;
  }

  private clockWrite(clock: Hlc): Write {
    return () => this.db.meta.put({ key: 'hlc', value: encodeHlc(clock) });
  }

  // ---- reads ----

  async get(id: string): Promise<StoredRecord | undefined> {
    const record = await this.db.records.get(id);
    return record && !record.deleted ? record : undefined;
  }

  async list(type: RecordType): Promise<StoredRecord[]> {
    return this.db.records.where('[type+deleted]').equals([type, 0]).toArray();
  }

  /** Every record, tombstones included. */
  async allRecords(): Promise<StoredRecord[]> {
    return this.db.records.toArray();
  }

  async counts(): Promise<{ counts: Partial<Record<RecordType, number>>; total: number }> {
    return countLive(await this.allRecords());
  }

  async outboxSize(): Promise<number> {
    return this.db.outbox.count();
  }

  /** A fingerprint of every record, to check two copies hold the same data. */
  async digest(): Promise<string> {
    return digestRecords(await this.allRecords());
  }

  async getMeta(key: MetaKey): Promise<unknown> {
    return (await this.db.meta.get(key))?.value;
  }

  async setMeta(
    key: Exclude<MetaKey, 'deviceId' | 'hlc' | 'schemaVersion' | 'lastSnapshotDay'>,
    value: unknown,
  ): Promise<void> {
    await this.db.meta.put({ key, value });
  }

  // ---- backups ----

  async exportBackup(): Promise<BackupFile> {
    return createBackup({
      records: await this.allRecords(),
      schemaVersion: this.migrations.currentVersion,
      exportedAt: this.now(),
      deviceId: this.deviceId,
    });
  }

  /** Call once a backup has actually been saved somewhere. */
  async recordBackupMade(): Promise<void> {
    await this.setMeta('lastBackupAt', this.now());
  }

  /**
   * Replaces the budget with these records (already checked and upgraded by parseBackup).
   * A snapshot of the current budget is taken first, in the same transaction.
   */
  async restoreRecords(target: readonly StoredRecord[]): Promise<void> {
    await this.replaceAll(target);
  }

  private async replaceAll(target: readonly StoredRecord[]): Promise<void> {
    await this.db.transaction('rw', this.allTables, async () => {
      const current = await this.db.records.toArray();
      let clock = await this.readClock();
      if (current.length === 0) {
        // A fresh device: bring the records in as they are, and move the clock past them.
        for (const record of target)
          clock = receiveHlc(clock, decodeHlc(record.hlc), this.now(), this.deviceId);
        await issue([...this.recordWrites(target), ...(clock ? [this.clockWrite(clock)] : [])]);
        return;
      }
      // Restoring is a deliberate change, so every difference gets a new timestamp and wins
      // over older copies on other devices. Records left out of the target become tombstones.
      const byId = new Map(current.map((r) => [r.id, r]));
      const targetIds = new Set(target.map((r) => r.id));
      const wanted = [
        ...target.filter((r) => {
          const existing = byId.get(r.id);
          return !existing || !sameContent(existing, r);
        }),
        ...current
          .filter((r) => !targetIds.has(r.id) && !r.deleted)
          .map((r) => ({ ...r, data: null, deleted: 1 as const })),
      ];
      const changed = wanted.map((record) => {
        clock = tickHlc(clock, this.now(), this.deviceId);
        return { ...record, hlc: encodeHlc(clock), device_id: this.deviceId };
      });
      const snapshot = await this.snapshotWrites(
        'beforeRestore',
        current,
        this.migrations.currentVersion,
      );
      await issue([
        ...snapshot,
        ...this.recordWrites(changed),
        ...(clock ? [this.clockWrite(clock)] : []),
      ]);
    });
    this.committed();
  }

  // ---- snapshots ----

  async listSnapshots(): Promise<SnapshotSummary[]> {
    const rows = await this.db.snapshots.toArray();
    return rows
      .map(({ id, takenAt, day, reason, counts, total, schemaVersion }) => ({
        id,
        takenAt,
        day,
        reason,
        counts,
        total,
        schemaVersion,
      }))
      .sort((a, b) => (a.id < b.id ? 1 : -1));
  }

  /** "Undo a bad day": puts the budget back as it was in a snapshot. */
  async restoreSnapshot(id: string): Promise<void> {
    const row = await this.db.snapshots.get(id);
    const data = await this.db.snapshotRecords.get(id);
    if (!row || !data) throw new RangeError(`no snapshot ${id}`);
    await this.replaceAll(migrateRecords(data.records, row.schemaVersion, this.migrations));
  }

  /**
   * Before the first change of each London day, keep a copy of the budget as it stood.
   * Reads only: returns the writes, to be issued with the change itself.
   */
  private async prepareDailySnapshot(): Promise<Write[]> {
    const day = todayInLondon(this.now());
    if ((await this.db.meta.get('lastSnapshotDay'))?.value === day) return [];
    const current = await this.db.records.toArray();
    const snapshot =
      current.length > 0
        ? await this.snapshotWrites('daily', current, this.migrations.currentVersion)
        : [];
    return [...snapshot, () => this.db.meta.put({ key: 'lastSnapshotDay', value: day })];
  }

  /** The writes that add a snapshot and prune old ones. Reads the existing snapshot list. */
  private async snapshotWrites(
    reason: SnapshotReason,
    records: StoredRecord[],
    schemaVersion: number,
  ): Promise<Write[]> {
    const takenAt = this.now();
    const infos: SnapshotInfo[] = (await this.db.snapshots.toArray()).map(
      ({ id, takenAt, day, reason }) => ({
        id,
        takenAt,
        day,
        reason,
      }),
    );
    // Ids sort in the order snapshots were taken, even two in the same millisecond.
    const prefix = `${String(takenAt).padStart(15, '0')}:`;
    const sameTime = infos
      .filter((i) => i.id.startsWith(prefix))
      .map((i) => Number(i.id.slice(prefix.length)));
    const row: SnapshotRow = {
      id: prefix + String(Math.max(-1, ...sameTime) + 1).padStart(4, '0'),
      takenAt,
      day: todayInLondon(takenAt),
      reason,
      schemaVersion,
      digest: digestRecords(records),
      ...countLive(records),
    };
    const stale = snapshotIdsToDelete([...infos, row], row.day);
    return [
      () => this.db.snapshots.put(row),
      () => this.db.snapshotRecords.put({ id: row.id, records }),
      () => this.db.snapshots.bulkDelete(stale),
      () => this.db.snapshotRecords.bulkDelete(stale),
    ];
  }

  // ---- schema ----

  /** Upgrades stored records when the app's schema is newer, after a snapshot. */
  private async upgradeStoredData(): Promise<void> {
    const target = this.migrations.currentVersion;
    await this.db.transaction('rw', this.allTables, async () => {
      const stored = (await this.db.meta.get('schemaVersion'))?.value;
      const setVersion: Write = () => this.db.meta.put({ key: 'schemaVersion', value: target });
      if (stored === undefined) {
        await setVersion();
        return;
      }
      if (typeof stored !== 'number')
        throw new SchemaError('unknownVersion', 'stored schema version is missing');
      if (stored > target) {
        throw new SchemaError(
          'newerVersion',
          'this budget was saved by a newer version of the app: reload to update',
        );
      }
      if (stored === target) return;
      const current = await this.db.records.toArray();
      const upgraded = migrateRecords(current, stored, this.migrations);
      const snapshot =
        current.length > 0 ? await this.snapshotWrites('migration', current, stored) : [];
      await issue([
        ...snapshot,
        () => this.db.records.clear(),
        () => this.db.records.bulkPut(upgraded),
        setVersion,
      ]);
    });
  }
}
