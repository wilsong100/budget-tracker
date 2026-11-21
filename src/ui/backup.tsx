// Backing up and restoring, the best way each browser allows (docs/PLAN.md, rules 5 and 6).
import { useRef, useState } from 'preact/hooks';
import { formatMediumDate } from '../domain';
import {
  LinkedBackupFile,
  browserBackupEnvironment,
  chooseBackupMethod,
  downloadBackup,
  onSessionEnd,
  pickNewestBackup,
  serialiseBackup,
  shareBackup,
  type BackupSummary,
  type ParsedBackup,
  type StoredRecord,
} from '../storage';
import { noteBackupMade, requireStore, save, showToast } from './state';

const NOUNS: Record<string, [string, string]> = {
  spend: ['spend', 'spends'],
  bill: ['bill', 'bills'],
  pot: ['pot', 'pots'],
  payRule: ['pay rule', 'pay rules'],
  setting: ['setting', 'settings'],
  category: ['category', 'categories'],
  debt: ['debt', 'debts'],
};

/** "412 spends, 18 bills, last change 3 Nov 2026" */
export function describeSummary(summary: Pick<BackupSummary, 'counts' | 'lastChange'>): string {
  const parts = ['spend', 'bill', 'pot', 'debt']
    .filter((type) => summary.counts[type as keyof typeof summary.counts])
    .map((type) => {
      const n = summary.counts[type as keyof typeof summary.counts]!;
      const [one, many] = NOUNS[type]!;
      return `${n} ${n === 1 ? one : many}`;
    });
  if (summary.lastChange) parts.push(`last change ${formatMediumDate(summary.lastChange)}`);
  return parts.length ? parts.join(', ') : 'an empty budget';
}

let linked: LinkedBackupFile | null = null;
function linkedFile(): LinkedBackupFile {
  linked ??= new LinkedBackupFile(requireStore());
  return linked;
}

/**
 * Keeps a linked backup file (Chrome and Edge) up to date: it's rewritten in place each time
 * the page is hidden, the last reliable moment in a session. Call once the store is open.
 */
export function keepLinkedBackupFresh(): void {
  const file = linkedFile();
  onSessionEnd(() => void file.write().catch(() => false));
}

export function backupMethod() {
  return chooseBackupMethod(browserBackupEnvironment());
}

const DONE: Record<string, string> = {
  linkedFile: 'Backup saved. It will be kept up to date after each visit.',
  share: 'Backup shared.',
  download: 'Backup saved to your downloads as budget-backup.json.',
};

/** Makes a backup now. Must be called from a click (the file picker and share sheet need one). */
export async function backUpNow(): Promise<void> {
  const method = backupMethod();
  try {
    if (method === 'linkedFile') {
      const file = linkedFile();
      const status = await file.status();
      if (status === 'none') await file.pick();
      else if (status === 'needsPermission' && !(await file.reconnect())) return;
      if (!(await file.write())) throw new Error('could not write the linked file');
    } else {
      const text = serialiseBackup(await requireStore().exportBackup());
      if (method === 'share') {
        if ((await shareBackup(text)) === 'cancelled') return;
      } else {
        downloadBackup(text);
      }
      await noteBackupMade();
    }
    showToast(DONE[method]!);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return; // picker closed
    console.error(error);
    showToast('The backup couldn’t be saved. Try again.', 'bad');
  }
}

export function BackupButton({ primary = false }: { primary?: boolean }) {
  return (
    <button
      type="button"
      class={`btn ${primary ? 'btn-primary' : 'btn-secondary'}`}
      onClick={() => void backUpNow()}
    >
      {backupMethod() === 'share' ? 'Share a backup' : 'Make a backup'}
    </button>
  );
}

/**
 * Restore from budget-backup.json: choose or drop one or more files (the newest is used),
 * see what's in it, then confirm. Nothing changes until "Replace my budget".
 */
export function Restore({ onRestored }: { onRestored?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [dragging, setDragging] = useState(false);

  async function read(files: FileList | null) {
    if (!files || files.length === 0) return;
    setParsed(pickNewestBackup(await Promise.all([...files].map((f) => f.text()))));
  }

  async function replace(records: StoredRecord[]) {
    const ok = await save((s) => s.restoreRecords(records), {
      message: 'Budget restored. The one it replaced is kept under “Undo a bad day”.',
    });
    if (ok) {
      setParsed(null);
      onRestored?.();
    }
  }

  return (
    <div
      class={`drop ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void read(e.dataTransfer?.files ?? null);
      }}
    >
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        multiple
        class="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="restore-file"
        onChange={(e) => {
          void read(e.currentTarget.files);
          e.currentTarget.value = '';
        }}
      />
      <button type="button" class="btn btn-quiet" onClick={() => input.current?.click()}>
        Restore from backup
      </button>
      <p class="muted small">
        Or drop budget-backup.json here. If you drop several, the newest is used.
      </p>
      {parsed && !parsed.ok && (
        <p class="error" role="alert">
          {parsed.message}
        </p>
      )}
      {parsed?.ok && (
        <div
          class="callout"
          role="alertdialog"
          aria-labelledby="restore-q"
          aria-describedby="restore-what"
        >
          <p>
            <strong id="restore-q">Replace your budget with this backup?</strong>{' '}
            <span id="restore-what">It has {describeSummary(parsed.summary)}.</span>
          </p>
          <div class="actions">
            <button
              type="button"
              class="btn btn-primary btn-small"
              onClick={() => void replace(parsed.records)}
            >
              Replace my budget
            </button>
            <button type="button" class="btn btn-quiet btn-small" onClick={() => setParsed(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
