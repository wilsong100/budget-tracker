// A bare test page for the storage layer (Phase 2). Built only by `vite --mode harness`;
// it never ships in the web or offline builds. Playwright drives it through window.harness.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { formatUkDate } from '../src/domain';
import {
  BudgetStore,
  LinkedBackupFile,
  browserBackupEnvironment,
  browserMarker,
  chooseBackupMethod,
  downloadBackup,
  onSessionEnd,
  pickNewestBackup,
  probeBrowserStorage,
  requestPersistentStorage,
  serialiseBackup,
  shareBackup,
  startupState,
  storageHealth,
  type BackupSummary,
  type Health,
  type HealthInput,
  type LinkableFileHandle,
  type MigrationSet,
  type ParsedBackup,
  type SnapshotSummary,
  type StoredRecord,
} from '../src/storage';

const params = new URLSearchParams(location.search);
const DB = params.get('db') ?? 'budget-planner-harness';

/** ?schema=v2 opens the store with a test-only migration, to exercise upgrades in real browsers. */
const TEST_V2: MigrationSet = {
  currentVersion: 2,
  steps: {
    1: (records) =>
      records.map((r): StoredRecord => {
        if (r.type !== 'spend' || r.deleted) return r;
        const { note, ...rest } = r.data as { note: string; amount: number };
        return { ...r, data: { ...rest, description: note } };
      }),
  },
};

const marker = browserMarker({ localStorage, document, path: '/budget-planner/' });

const NOUNS: Record<string, [string, string]> = {
  spend: ['spend', 'spends'],
  bill: ['bill', 'bills'],
  pot: ['pot', 'pots'],
  payRule: ['pay rule', 'pay rules'],
  setting: ['setting', 'settings'],
  category: ['category', 'categories'],
  debt: ['debt', 'debts'],
};

/** "412 spends, 18 bills, last change 3 Nov" */
function describeSummary(summary: Pick<BackupSummary, 'counts' | 'lastChange'>): string {
  const parts = Object.entries(summary.counts).map(([type, n]) => {
    const [one, many] = NOUNS[type]!;
    return `${n} ${n === 1 ? one : many}`;
  });
  if (summary.lastChange) {
    const date = new Date(`${summary.lastChange}T12:00:00Z`);
    parts.push(
      `last change ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`,
    );
  }
  return parts.length ? parts.join(', ') : 'an empty budget';
}

let spendCounter = 0;
const spendChange = () => ({
  type: 'spend' as const,
  data: { amount: 100 + (spendCounter++ % 900), note: `coffee ${spendCounter}` },
});

async function boot() {
  let store: BudgetStore | null = null;
  let openError: string | null = null;
  try {
    store = await BudgetStore.open({
      name: DB,
      marker,
      ...(params.get('schema') === 'v2' ? { migrations: TEST_V2 } : {}),
    });
  } catch (error) {
    openError = error instanceof Error ? error.message : String(error);
  }
  const probe = await probeBrowserStorage();
  const linked = store ? new LinkedBackupFile(store) : null;
  if (linked) onSessionEnd(() => void linked.write());

  const harness = {
    store,
    openError,
    probe,
    async addSpends(n: number, options: { oneChange?: boolean } = {}) {
      if (options.oneChange) {
        await store!.putMany(Array.from({ length: n }, spendChange));
      } else {
        for (let i = 0; i < n; i++) {
          const change = spendChange();
          await store!.put(change.type, change.data);
        }
      }
    },
    /** Starts writing and returns at once, so a test can close the browser mid-write. */
    startSpendsWithoutWaiting(n: number, options: { oneChange?: boolean } = {}) {
      void harness.addSpends(n, options).catch(() => {});
    },
    counts: () => store!.counts(),
    outboxSize: () => store!.outboxSize(),
    digest: () => store!.digest(),
    allRecords: () => store!.allRecords(),
    exportText: async () => serialiseBackup(await store!.exportBackup()),
    preview: (texts: string[]): ParsedBackup =>
      pickNewestBackup(texts, params.get('schema') === 'v2' ? TEST_V2 : undefined),
    async restoreTexts(texts: string[]) {
      const parsed = harness.preview(texts);
      if (parsed.ok) await store!.restoreRecords(parsed.records);
      return parsed.ok
        ? {
            ok: true as const,
            summary: parsed.summary,
            description: describeSummary(parsed.summary),
          }
        : { ok: false as const, problem: parsed.problem, message: parsed.message };
    },
    snapshots: () => store!.listSnapshots(),
    restoreSnapshot: (id: string) => store!.restoreSnapshot(id),
    startup: async () =>
      startupState({
        recordCount: (await store!.allRecords()).length,
        markerPresent: marker.has(),
      }),
    /** Deletes the database but keeps the marker, like a browser clearing only IndexedDB. */
    async clearDatabaseOnly() {
      store?.close();
      await BudgetStore.deleteDatabase(DB);
    },
    /** Deletes everything this page stored, like "Clear site data". */
    async clearSiteData() {
      await harness.clearDatabaseOnly();
      marker.clear();
      localStorage.clear();
    },
    linkHandle: (handle: LinkableFileHandle) => linked!.link(handle),
    writeLinked: () => linked!.write(),
    linkedStatus: () => linked!.status(),
    health: (): Health => storageHealth(liveHealthInput(store, probe), Date.now()),
  };
  (window as unknown as { harness: typeof harness }).harness = harness;
  render(<Harness h={harness} />, document.getElementById('app')!);
  document.body.dataset['ready'] = 'true';
}

function liveHealthInput(
  store: BudgetStore | null,
  probe: { persisted: boolean | null; privateMode: boolean },
): HealthInput {
  return {
    available: store !== null,
    privateMode: probe.privateMode,
    persisted: probe.persisted,
    sync: null,
  };
}

const GALLERY: [string, HealthInput, number][] = [
  [
    'Persistent storage granted',
    { available: true, privateMode: false, persisted: true, sync: null },
    0,
  ],
  [
    'Sync on, last synced 2 minutes ago',
    { available: true, privateMode: false, persisted: false, sync: { lastSyncedAt: -120_000 } },
    0,
  ],
  [
    'Persistence denied, sync off',
    { available: true, privateMode: false, persisted: false, sync: null },
    0,
  ],
  [
    'Private window detected',
    { available: true, privateMode: true, persisted: false, sync: null },
    0,
  ],
  [
    'IndexedDB unavailable',
    { available: false, privateMode: false, persisted: null, sync: null },
    0,
  ],
];

function Chip({ health }: { health: Health }) {
  return (
    <span class={`chip ${health.tone}`} role="status" data-kind={health.kind}>
      {health.message}
    </span>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Harness({ h }: { h: any }) {
  const store: BudgetStore | null = h.store;
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<string>('…');
  const [counts, setCounts] = useState<{ total: number; counts: Record<string, number> }>({
    total: 0,
    counts: {},
  });
  const [outbox, setOutbox] = useState(0);
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [pending, setPending] = useState<{ texts: string[]; parsed: ParsedBackup } | null>(null);
  const [message, setMessage] = useState('');
  const [persisted, setPersisted] = useState<boolean | null>(h.probe.persisted);
  const [linkStatus, setLinkStatus] = useState('none');

  useEffect(() => store?.subscribe(() => setTick((t) => t + 1)), [store]);
  useEffect(() => {
    if (!store) return;
    void (async () => {
      setState(await h.startup());
      setCounts(await store.counts());
      setOutbox(await store.outboxSize());
      setSnapshots(await store.listSnapshots());
      setLinkStatus(await h.linkedStatus());
    })();
  }, [tick, store]);

  const health = storageHealth({ ...liveHealthInput(store, h.probe), persisted }, Date.now());

  async function backUp() {
    const text = await h.exportText();
    const method = chooseBackupMethod(browserBackupEnvironment());
    if (method === 'linkedFile') {
      if ((await h.linkedStatus()) === 'none') await new LinkedBackupFile(store!).pick();
      else if ((await h.linkedStatus()) === 'needsPermission')
        await new LinkedBackupFile(store!).reconnect();
      setMessage(
        (await h.writeLinked()) ? 'Backup file updated.' : 'Could not write the backup file.',
      );
    } else if (method === 'share') {
      setMessage((await shareBackup(text)) === 'shared' ? 'Backup shared.' : 'Sharing cancelled.');
      await store!.recordBackupMade();
    } else {
      downloadBackup(text);
      await store!.recordBackupMade();
      setMessage('Backup downloaded as budget-backup.json.');
    }
    setTick((t) => t + 1);
  }

  async function chooseFiles(files: FileList | null) {
    if (!files?.length) return;
    const texts = await Promise.all([...files].map((f) => f.text()));
    setPending({ texts, parsed: h.preview(texts) });
  }

  if (!store) {
    return (
      <main>
        <section>
          <Chip health={health} />
          <p>Couldn't open the database: {h.openError}</p>
        </section>
      </main>
    );
  }

  return (
    <>
      <header>
        <h1>Storage harness</h1>
        <div class="muted" style="color:#cfe5e1">
          Database <code>{store.name}</code> · device <code>{store.deviceId.slice(0, 8)}</code>
        </div>
      </header>
      <main>
        <section aria-labelledby="startup">
          <h2 id="startup">On start</h2>
          {state === 'missing' ? (
            <div data-testid="missing">
              <p>
                <strong>Your budget seems to be missing</strong>
              </p>
              <p class="muted">This browser held a budget, but its storage has been cleared.</p>
              <div class="row">
                <label class="drop">
                  Restore from backup{' '}
                  <input
                    type="file"
                    accept=".json,application/json"
                    multiple
                    onChange={(e) => chooseFiles(e.currentTarget.files)}
                  />
                </label>
                <button disabled title="Arrives with sync in Phase 6">
                  Reconnect sync
                </button>
              </div>
            </div>
          ) : (
            <p data-testid="startup-state">
              {state === 'fresh' ? 'Fresh: onboarding would show here.' : 'Ready.'}
            </p>
          )}
        </section>

        <section aria-labelledby="health">
          <h2 id="health">Storage health (live)</h2>
          <div class="row">
            <Chip health={health} />
            <button
              onClick={async () => {
                const granted = await requestPersistentStorage();
                await store.setMeta('persisted', granted);
                setPersisted(granted);
              }}
            >
              Ask for persistent storage
            </button>
          </div>
          <p class="muted">
            persisted: {String(persisted)} · private window: {String(h.probe.privateMode)} · quota:{' '}
            {h.probe.quota === null ? 'unknown' : `${Math.round(h.probe.quota / 1e6)} MB`}
          </p>
        </section>

        <section aria-labelledby="gallery">
          <h2 id="gallery">Every storage health state</h2>
          <div class="gallery">
            {GALLERY.map(([label, input]) => {
              const now = Date.now();
              const withTime = input.sync
                ? { ...input, sync: { lastSyncedAt: now + (input.sync.lastSyncedAt ?? 0) } }
                : input;
              return (
                <div class="row" key={label}>
                  <Chip health={storageHealth(withTime, now)} /> <span class="muted">{label}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="data">
          <h2 id="data">Data</h2>
          <p data-testid="counts">
            {describeSummary({ counts: counts.counts, lastChange: null })} · {counts.total} live
            records · outbox {outbox}
          </p>
          <div class="row">
            <button onClick={() => h.addSpends(1)}>Add a spend</button>
            <button onClick={() => h.addSpends(100)}>Add 100 spends</button>
            <button
              onClick={async () =>
                (await store.list('spend'))[0] && store.remove((await store.list('spend'))[0]!.id)
              }
            >
              Delete a spend
            </button>
          </div>
        </section>

        <section aria-labelledby="backup">
          <h2 id="backup">Backup and restore</h2>
          <div class="row">
            <button onClick={backUp}>
              Back up now ({chooseBackupMethod(browserBackupEnvironment())})
            </button>
            <span class="muted">linked file: {linkStatus}</span>
          </div>
          <label
            class="drop"
            style="display:block;margin-top:8px"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void chooseFiles(e.dataTransfer?.files ?? null);
            }}
          >
            Drop budget-backup.json here (or several: the newest is used), or choose a file
            <input
              type="file"
              accept=".json,application/json"
              multiple
              onChange={(e) => chooseFiles(e.currentTarget.files)}
            />
          </label>
          {pending &&
            (pending.parsed.ok ? (
              <div role="alertdialog" aria-label="Restore this backup?">
                <p>
                  Backup from {formatUkDate(pending.parsed.backup.exportedAt.slice(0, 10))}:{' '}
                  {describeSummary(pending.parsed.summary)}. Restoring replaces what's on this
                  device; a snapshot is kept first.
                </p>
                <div class="row">
                  <button
                    onClick={async () => {
                      const result = await h.restoreTexts(pending.texts);
                      setMessage(result.ok ? `Restored ${result.description}.` : result.message);
                      setPending(null);
                    }}
                  >
                    Replace my budget
                  </button>
                  <button onClick={() => setPending(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <p role="alert" class="bad">
                {pending.parsed.message}
              </p>
            ))}
          {message && <p role="status">{message}</p>}
        </section>

        <section aria-labelledby="snapshots">
          <h2 id="snapshots">Snapshots (undo a bad day)</h2>
          {snapshots.length === 0 ? (
            <p class="muted">No snapshots yet: one is taken before the first change of each day.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Why</th>
                  <th>Holds</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id}>
                    <td>{formatUkDate(s.day)}</td>
                    <td>{s.reason}</td>
                    <td>{describeSummary({ counts: s.counts, lastChange: null })}</td>
                    <td>
                      <button onClick={() => store.restoreSnapshot(s.id)}>Restore</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}

void boot();
