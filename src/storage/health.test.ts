import { describe, expect, it } from 'vitest';
import {
  looksPrivate,
  needsBackupReminder,
  startupState,
  storageHealth,
  timeAgo,
  type HealthInput,
} from './health';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const base: HealthInput = { available: true, privateMode: false, persisted: true, sync: null };

describe('storageHealth', () => {
  it('shows the four states from the plan', () => {
    expect(storageHealth(base, NOW)).toEqual({
      kind: 'saved',
      message: 'Saved on this device',
      tone: 'ok',
    });
    expect(storageHealth({ ...base, sync: { lastSyncedAt: NOW - 2 * 60_000 } }, NOW)).toEqual({
      kind: 'synced',
      message: 'Synced 2 min ago',
      tone: 'ok',
    });
    expect(storageHealth({ ...base, persisted: false }, NOW)).toEqual({
      kind: 'unprotected',
      message: 'Not protected: turn on sync or make a backup',
      tone: 'warn',
    });
    expect(storageHealth({ ...base, privateMode: true }, NOW)).toEqual({
      kind: 'private',
      message: 'Private window: nothing will be kept',
      tone: 'bad',
    });
  });

  it('says when it cannot save at all, before anything else', () => {
    expect(storageHealth({ ...base, available: false, privateMode: true }, NOW).kind).toBe(
      'unavailable',
    );
  });

  it('treats sync as protection even without persistent storage', () => {
    expect(
      storageHealth({ ...base, persisted: false, sync: { lastSyncedAt: null } }, NOW).kind,
    ).toBe('saved');
  });

  it('does not alarm when the browser cannot say whether storage is persistent', () => {
    expect(storageHealth({ ...base, persisted: null }, NOW).kind).toBe('saved');
  });
});

describe('timeAgo', () => {
  it.each([
    [0, 'just now'],
    [59_000, 'just now'],
    [60_000, '1 min ago'],
    [59 * 60_000, '59 min ago'],
    [60 * 60_000, '1 hour ago'],
    [5 * 3_600_000, '5 hours ago'],
    [24 * 3_600_000, '1 day ago'],
    [3 * 86_400_000, '3 days ago'],
    [-5_000, 'just now'],
  ])('%i ms ago is %s', (ago, text) => {
    expect(timeAgo(NOW - ago, NOW)).toBe(text);
  });
});

describe('looksPrivate', () => {
  const normal = {
    expectsServiceWorker: true,
    hasServiceWorker: true,
    quota: 50_000_000_000,
    opfsRejected: false,
  };

  it('says no for a normal window', () => {
    expect(looksPrivate(normal)).toBe(false);
    expect(looksPrivate({ ...normal, quota: null })).toBe(false);
  });

  it('spots Firefox private windows', () => {
    expect(looksPrivate({ ...normal, hasServiceWorker: false })).toBe(true);
  });

  it('does not misread a file opened from disk, which never has service workers', () => {
    expect(looksPrivate({ ...normal, expectsServiceWorker: false, hasServiceWorker: false })).toBe(
      false,
    );
  });

  it('spots Safari and Chromium private windows', () => {
    expect(looksPrivate({ ...normal, opfsRejected: true })).toBe(true);
    expect(looksPrivate({ ...normal, quota: 100_000_000 })).toBe(true);
  });
});

describe('needsBackupReminder', () => {
  const input = {
    hasData: true,
    syncOn: false,
    lastBackupAt: NOW - 8 * 86_400_000,
    snoozedUntil: null,
  };

  it('reminds when the last backup is over 7 days old, or there is none', () => {
    expect(needsBackupReminder(input, NOW)).toBe(true);
    expect(needsBackupReminder({ ...input, lastBackupAt: null }, NOW)).toBe(true);
    expect(needsBackupReminder({ ...input, lastBackupAt: NOW - 6 * 86_400_000 }, NOW)).toBe(false);
  });

  it('stays quiet with sync on, with no data, or while snoozed', () => {
    expect(needsBackupReminder({ ...input, syncOn: true }, NOW)).toBe(false);
    expect(needsBackupReminder({ ...input, hasData: false }, NOW)).toBe(false);
    expect(needsBackupReminder({ ...input, snoozedUntil: NOW + 1 }, NOW)).toBe(false);
    expect(needsBackupReminder({ ...input, snoozedUntil: NOW - 1 }, NOW)).toBe(true);
  });
});

describe('startupState', () => {
  it('shows onboarding only when there was never any data', () => {
    expect(startupState({ recordCount: 0, markerPresent: false })).toBe('fresh');
    expect(startupState({ recordCount: 3, markerPresent: true })).toBe('ready');
    expect(startupState({ recordCount: 3, markerPresent: false })).toBe('ready');
    expect(startupState({ recordCount: 0, markerPresent: true })).toBe('missing');
  });
});
