// The app's live state and every change it can make. Screens read the signals and call the
// actions; they never touch the store directly. Each action writes to IndexedDB first, and
// the screen only changes once the write has committed (CLAUDE.md, rule 1).
import { computed, signal } from '@preact/signals';
import { todayInLondon, type IsoDate } from '../domain';
import {
  BudgetStore,
  browserMarker,
  needsBackupReminder,
  probeBrowserStorage,
  requestPersistentStorage,
  startupState,
  storageHealth,
  type Change,
  type Health,
  type StorageProbe,
  type StoredRecord,
} from '../storage';
import { DEFAULT_CATEGORIES } from '../domain';
import { IDS, isSetUp, readBudget, toJson, type Budget, type PrefsData } from './model';

export type Phase = 'loading' | 'fresh' | 'missing' | 'ready' | 'unavailable';

const EMPTY = readBudget([]);

export const phase = signal<Phase>('loading');
export const budget = signal<Budget>(EMPTY);
export const today = signal<IsoDate>(todayInLondon(Date.now()));
export const health = signal<Health>({
  kind: 'saved',
  message: 'Saved on this device',
  tone: 'ok',
});
export const backupReminder = signal(false);

export interface Toast {
  message: string;
  tone: 'ok' | 'bad';
  undo?: () => Promise<void>;
}
export const toast = signal<Toast | null>(null);

export const setUp = computed(() => isSetUp(budget.value));

let store: BudgetStore | null = null;
let probe: StorageProbe = { persisted: null, privateMode: false, quota: null };

const base = import.meta.env.BASE_URL;
const marker = browserMarker({
  localStorage: globalThis.localStorage,
  document: globalThis.document,
  ...(base.startsWith('/') ? { path: base } : {}),
});

let lastStamp = 0;
/** The time now, in ms, always later than the last stamp: tells changes apart in order. */
export function stamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

export function requireStore(): BudgetStore {
  if (!store) throw new Error('storage is not open');
  return store;
}

function refreshHealth(): void {
  health.value = storageHealth(
    {
      available: store !== null,
      privateMode: probe.privateMode,
      persisted: probe.persisted,
      sync: null,
    },
    Date.now(),
  );
}

async function refreshReminder(records: readonly StoredRecord[]): Promise<void> {
  const s = requireStore();
  const lastBackupAt = (await s.getMeta('lastBackupAt')) as number | undefined;
  const snoozedUntil = (await s.getMeta('backupSnoozedUntil')) as number | undefined;
  backupReminder.value =
    !budget.value.prefs.example &&
    needsBackupReminder(
      {
        hasData: records.some((r) => r.deleted === 0),
        syncOn: false,
        lastBackupAt: lastBackupAt ?? null,
        snoozedUntil: snoozedUntil ?? null,
      },
      Date.now(),
    );
}

/** Reads everything again after a change here or in another tab. */
export async function reload(): Promise<void> {
  const records = await requireStore().allRecords();
  budget.value = readBudget(records);
  if (isSetUp(budget.value)) {
    phase.value = 'ready';
  } else {
    // Tombstones count: a budget the user cleared on purpose isn't a missing one.
    const state = startupState({ recordCount: records.length, markerPresent: marker.has() });
    phase.value = state === 'missing' ? 'missing' : 'fresh';
  }
  await refreshReminder(records);
}

function applyTheme(): void {
  const theme = budget.value.prefs.theme;
  if (theme === 'system') delete document.documentElement.dataset['theme'];
  else document.documentElement.dataset['theme'] = theme;
}

function watchToday(): void {
  const tick = () => {
    const now = todayInLondon(Date.now());
    if (now !== today.value) today.value = now;
  };
  setInterval(tick, 30_000);
  document.addEventListener('visibilitychange', tick);
}

export async function start(): Promise<void> {
  watchToday();
  probe = await probeBrowserStorage().catch(() => probe);
  try {
    store = await BudgetStore.open({ marker });
  } catch {
    store = null;
    refreshHealth();
    phase.value = 'unavailable';
    return;
  }
  refreshHealth();
  store.subscribe(() => {
    void reload().then(applyTheme);
  });
  await reload();
  applyTheme();
}

// ---- saving ----

const SAVE_FAILED = "Couldn't save that change, so nothing was changed. Try again.";

/**
 * Runs a write. On success the store tells us and the screens refresh; on failure the user
 * sees why and nothing on screen changes. Returns whether it saved.
 */
export async function save(
  write: (s: BudgetStore) => Promise<unknown>,
  done?: Omit<Toast, 'tone'>,
): Promise<boolean> {
  try {
    await write(requireStore());
  } catch (error) {
    console.error(error);
    toast.value = { message: SAVE_FAILED, tone: 'bad' };
    return false;
  }
  await reload();
  if (done) toast.value = { ...done, tone: 'ok' };
  return true;
}

export function savePrefs(changes: Partial<PrefsData>): Promise<boolean> {
  const prefs = { ...budget.value.prefs, ...changes };
  return save((s) => s.put('setting', toJson(prefs), IDS.prefs)).then((ok) => {
    applyTheme();
    return ok;
  });
}

/** Finishes setup in one change, then asks the browser to keep the data (docs/PLAN.md, rule 2). */
export async function finishSetup(changes: Change[]): Promise<boolean> {
  const categories: Change[] = budget.value.categories.length
    ? []
    : DEFAULT_CATEGORIES.map((c) => ({
        type: 'category',
        id: c.id,
        data: { name: c.name, planned: null },
      }));
  const ok = await save((s) => s.putMany([...changes, ...categories]));
  if (ok) {
    // The first backup reminder comes a week after setup, not straight away.
    await snoozeBackupReminder();
    await askToPersist();
  }
  return ok;
}

export async function askToPersist(): Promise<void> {
  const granted = await requestPersistentStorage();
  if (granted !== null) {
    probe = { ...probe, persisted: granted };
    await store?.setMeta('persisted', granted).catch(() => undefined);
  }
  refreshHealth();
}

/** Removes every record in one change (a snapshot is kept first), e.g. to clear the example. */
export function clearEverything(): Promise<boolean> {
  return save((s) => s.restoreRecords([]));
}

export async function snoozeBackupReminder(): Promise<void> {
  await store?.setMeta('backupSnoozedUntil', Date.now() + 7 * 86_400_000).catch(() => undefined);
  backupReminder.value = false;
}

export async function noteBackupMade(): Promise<void> {
  await store?.recordBackupMade().catch(() => undefined);
  backupReminder.value = false;
}

export function showToast(message: string, tone: Toast['tone'] = 'ok'): void {
  toast.value = { message, tone };
}
