import { BACKUP_FILE_NAME, serialiseBackup } from './backup';
import type { BudgetStore } from './store';

/**
 * Backing up the best way each browser allows (docs/PLAN.md, rule 6):
 *  - Chrome and Edge on desktop: a linked file, rewritten in place after each session
 *  - iPhone and Android: the share sheet, to Files, Google Drive or email
 *  - Safari and Firefox on desktop: a download with a fixed file name
 */
export type BackupMethod = 'linkedFile' | 'share' | 'download';

export interface BackupEnvironment {
  hasSaveFilePicker: boolean;
  canShareFiles: boolean;
  isMobile: boolean;
}

export function chooseBackupMethod(env: BackupEnvironment): BackupMethod {
  if (env.isMobile && env.canShareFiles) return 'share';
  if (env.hasSaveFilePicker && !env.isMobile) return 'linkedFile';
  return 'download';
}

const backupFile = (text: string) =>
  new File([text], BACKUP_FILE_NAME, { type: 'application/json' });

export function browserBackupEnvironment(win: Window = window): BackupEnvironment {
  const nav = win.navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  let canShareFiles: boolean;
  try {
    canShareFiles =
      typeof nav.canShare === 'function' && nav.canShare({ files: [backupFile('{}')] });
  } catch {
    canShareFiles = false; // some browsers throw instead of returning false
  }
  const coarse =
    typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches;
  return {
    hasSaveFilePicker:
      typeof (win as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function',
    canShareFiles,
    isMobile: nav.userAgentData?.mobile ?? (coarse && nav.maxTouchPoints > 0),
  };
}

/** Saves budget-backup.json through the browser's downloads. */
export function downloadBackup(text: string, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = BACKUP_FILE_NAME;
  link.rel = 'noopener';
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Opens the share sheet with budget-backup.json. 'cancelled' if the user closes it. */
export async function shareBackup(
  text: string,
  nav: Navigator = navigator,
): Promise<'shared' | 'cancelled'> {
  try {
    await nav.share({ files: [backupFile(text)], title: 'Budget backup' });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}

// The File System Access API isn't in TypeScript's DOM types yet.
interface WritableFile {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
export interface LinkableFileHandle {
  readonly name: string;
  createWritable(): Promise<WritableFile>;
  queryPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
}

export type LinkedFileStatus = 'none' | 'ready' | 'needsPermission';

const writeQueues = new WeakMap<BudgetStore, Promise<unknown>>();

/**
 * A backup file the user picked once (Chrome and Edge). Its handle is kept in IndexedDB and
 * the same file is rewritten each time, so its name never changes and no copies pile up.
 */
export class LinkedBackupFile {
  constructor(private readonly store: BudgetStore) {}

  /** Opens the save dialog. Must be called from a click. */
  async pick(win: Window = window): Promise<LinkableFileHandle> {
    const picker = (
      win as unknown as { showSaveFilePicker: (o: unknown) => Promise<LinkableFileHandle> }
    ).showSaveFilePicker;
    const handle = await picker({
      suggestedName: BACKUP_FILE_NAME,
      types: [{ description: 'Budget backup', accept: { 'application/json': ['.json'] } }],
    });
    await this.link(handle);
    return handle;
  }

  async link(handle: LinkableFileHandle): Promise<void> {
    await this.store.setMeta('linkedBackupFile', handle);
  }

  async unlink(): Promise<void> {
    await this.store.setMeta('linkedBackupFile', null);
  }

  async handle(): Promise<LinkableFileHandle | null> {
    const handle = (await this.store.getMeta('linkedBackupFile')) as
      LinkableFileHandle | null | undefined;
    return handle ?? null;
  }

  async status(): Promise<LinkedFileStatus> {
    const handle = await this.handle();
    if (!handle) return 'none';
    const permission = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    return permission === 'granted' ? 'ready' : 'needsPermission';
  }

  /** Asks again for permission after a restart. Must be called from a click. */
  async reconnect(): Promise<boolean> {
    const handle = await this.handle();
    if (!handle) return false;
    return ((await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'granted') === 'granted';
  }

  /**
   * Rewrites the linked file in place with a fresh backup. False if it can't right now.
   * Writes take turns (across tabs too, where Web Locks exist): two writers on one file
   * would race on the browser's temporary copy and one would fail.
   */
  write(): Promise<boolean> {
    const run = () => this.writeNow();
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;
    const next = (writeQueues.get(this.store) ?? Promise.resolve()).then(() =>
      locks ? locks.request(`${this.store.name}:linked-backup-file`, run) : run(),
    );
    writeQueues.set(
      this.store,
      next.catch(() => undefined),
    );
    return next;
  }

  private async writeNow(): Promise<boolean> {
    const handle = await this.handle();
    if (!handle || (await this.status()) !== 'ready') return false;
    const text = serialiseBackup(await this.store.exportBackup());
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    await this.store.recordBackupMade();
    return true;
  }
}

/**
 * Calls `onEnd` when the page is hidden (switching app, closing the tab): the last reliable
 * moment to rewrite the linked backup file. Returns a function that stops watching.
 */
export function onSessionEnd(onEnd: () => void, doc: Document = document): () => void {
  const listener = () => {
    if (doc.visibilityState === 'hidden') onEnd();
  };
  doc.addEventListener('visibilitychange', listener);
  return () => doc.removeEventListener('visibilitychange', listener);
}
