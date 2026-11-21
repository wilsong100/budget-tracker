// The storage layer's public API. The UI imports from here, not from individual files.
export {
  BudgetStore,
  DB_NAME,
  type Change,
  type MetaKey,
  type SnapshotSummary,
  type StoreOptions,
} from './store';
export {
  BACKUP_FILE_NAME,
  BACKUP_MESSAGES,
  parseBackup,
  pickNewestBackup,
  serialiseBackup,
  type BackupFile,
  type BackupProblem,
  type BackupSummary,
  type ParsedBackup,
} from './backup';
export {
  LinkedBackupFile,
  browserBackupEnvironment,
  chooseBackupMethod,
  downloadBackup,
  onSessionEnd,
  shareBackup,
  type BackupMethod,
  type LinkableFileHandle,
  type LinkedFileStatus,
} from './backupTargets';
export {
  needsBackupReminder,
  startupState,
  storageHealth,
  timeAgo,
  type Health,
  type HealthInput,
} from './health';
export { browserMarker, memoryMarker, type DataMarker } from './marker';
export { MIGRATIONS, SchemaError, type Migration, type MigrationSet } from './migrations';
export { probeBrowserStorage, requestPersistentStorage, type StorageProbe } from './platform';
export { RECORD_TYPES, SCHEMA_VERSION, type RecordType, type StoredRecord } from './records';
export type { Json } from './canonicalJson';
