/** The storage health chip, which is always on screen (docs/PLAN.md, Differentiator 1). */
export type HealthKind = 'saved' | 'synced' | 'unprotected' | 'private' | 'unavailable';

export interface Health {
  kind: HealthKind;
  message: string;
  tone: 'ok' | 'warn' | 'bad';
}

export interface HealthInput {
  /** IndexedDB opened and a write succeeded. */
  available: boolean;
  privateMode: boolean;
  /** Result of navigator.storage.persisted(); null where the browser can't say. */
  persisted: boolean | null;
  /** Null when sync is off. */
  sync: { lastSyncedAt: number | null } | null;
}

export function storageHealth(input: HealthInput, now: number): Health {
  if (!input.available) {
    return {
      kind: 'unavailable',
      message: "Can't save on this device: check your browser's settings",
      tone: 'bad',
    };
  }
  if (input.privateMode)
    return { kind: 'private', message: 'Private window: nothing will be kept', tone: 'bad' };
  if (input.sync && input.sync.lastSyncedAt !== null) {
    return {
      kind: 'synced',
      message: `Synced ${timeAgo(input.sync.lastSyncedAt, now)}`,
      tone: 'ok',
    };
  }
  if (input.persisted === false && !input.sync) {
    return {
      kind: 'unprotected',
      message: 'Not protected: turn on sync or make a backup',
      tone: 'warn',
    };
  }
  return { kind: 'saved', message: 'Saved on this device', tone: 'ok' };
}

/** "just now", "1 min ago", "2 min ago", "3 hours ago", "2 days ago". */
export function timeAgo(then: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export interface PrivateProbe {
  /** True on http(s) pages, where a missing service worker API means something. */
  expectsServiceWorker: boolean;
  hasServiceWorker: boolean;
  /** navigator.storage.estimate() quota in bytes, or null. */
  quota: number | null;
  /** True if navigator.storage.getDirectory() exists and rejected. */
  opfsRejected: boolean;
}

/** Below this, Chromium's quota usually means an incognito window. */
const INCOGNITO_QUOTA = 120_000_000;

/**
 * Best-effort private-window detection. Browsers don't say outright, so this uses known signs:
 * Firefox private windows have no service worker API, Safari's reject the origin private file
 * system, and Chromium incognito gives a small fixed quota. A false "private" warning is
 * possible on a nearly full disk; the message only advises, it never blocks.
 */
export function looksPrivate(probe: PrivateProbe): boolean {
  if (probe.expectsServiceWorker && !probe.hasServiceWorker) return true;
  if (probe.opfsRejected) return true;
  return probe.quota !== null && probe.quota < INCOGNITO_QUOTA;
}

export const BACKUP_REMINDER_DAYS = 7;

/** One calm prompt on Today when sync is off and the last backup is over 7 days old. */
export function needsBackupReminder(
  input: {
    hasData: boolean;
    syncOn: boolean;
    lastBackupAt: number | null;
    snoozedUntil: number | null;
  },
  now: number,
): boolean {
  if (!input.hasData || input.syncOn) return false;
  if (input.snoozedUntil !== null && input.snoozedUntil > now) return false;
  return (
    input.lastBackupAt === null || now - input.lastBackupAt > BACKUP_REMINDER_DAYS * 86_400_000
  );
}

/**
 * What to show on start. If the database is empty but the marker says there was data,
 * don't show onboarding: show "Your budget seems to be missing".
 */
export function startupState(input: {
  recordCount: number;
  markerPresent: boolean;
}): 'fresh' | 'ready' | 'missing' {
  if (input.recordCount > 0) return 'ready';
  return input.markerPresent ? 'missing' : 'fresh';
}
