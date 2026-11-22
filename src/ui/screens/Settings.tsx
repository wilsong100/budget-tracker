import { useEffect, useState } from 'preact/hooks';
import {
  REGIONS,
  describePayCycle,
  formatMediumDate,
  formatPence,
  formatShortDate,
  type Region,
} from '../../domain';
import { timeAgo, type SnapshotSummary } from '../../storage';
import { BackupButton, Restore, describeSummary } from '../backup';
import { Band, Field, MoneyInput, TextInput, WhatsThis } from '../components';
import {
  CYCLE_CHOICES,
  amountFrom,
  cycleFrom,
  nextPaydayFor,
  poundsText,
  type CycleChoice,
} from '../forms';
import { IDS, toJson, type PayData, type Theme } from '../model';
import { budget, clearEverything, health, requireStore, save, savePrefs, today } from '../state';

const REGION_NAMES: Record<Region, string> = {
  'england-and-wales': 'England and Wales',
  scotland: 'Scotland',
  'northern-ireland': 'Northern Ireland',
};

export function Settings() {
  const { prefs } = budget.value;
  const advanced = prefs.mode === 'advanced';
  return (
    <main id="content">
      <Band title="Settings" focusKey="settings" />
      <div class="wrap">
        {prefs.example && (
          <div class="callout">
            <p>You’re looking at example numbers.</p>
            <button
              type="button"
              class="btn btn-secondary btn-small"
              onClick={() => void clearEverything()}
            >
              Clear the example
            </button>
          </div>
        )}
        <PayPanel />
        <SafetyPanel />
        <CategoriesPanel />
        <AppearancePanel />
        <section class="panel" aria-labelledby="advanced-h">
          <h2 id="advanced-h">Advanced</h2>
          <label class="choice">
            <input
              type="checkbox"
              checked={advanced}
              onChange={(e) =>
                void savePrefs({ mode: e.currentTarget.checked ? 'advanced' : 'simple' })
              }
            />
            Show advanced options
          </label>
          <p class="muted small">
            A buffer, your overdraft and more pages as they arrive. Turning this off hides them but
            deletes nothing.
          </p>
          {advanced && <AdvancedOptions />}
        </section>
        <DangerPanel />
      </div>
    </main>
  );
}

function PayPanel() {
  const pay = budget.value.pay;
  const [editing, setEditing] = useState(false);
  if (!pay) return null;
  const next = nextPaydayFor(pay.cycle, pay.region, today.value);
  return (
    <section class="panel" aria-labelledby="pay-h">
      <h2 id="pay-h">Your pay</h2>
      {editing ? (
        <PayEditor pay={pay} onClose={() => setEditing(false)} />
      ) : (
        <>
          <p>
            {describePayCycle(pay.cycle)}, {formatPence(pay.amount)} take-home. Next payday{' '}
            {formatShortDate(next.date)}.
          </p>
          <p class="muted small">Bank holidays: {REGION_NAMES[pay.region]}.</p>
          <button type="button" class="btn btn-quiet btn-small" onClick={() => setEditing(true)}>
            Change pay
          </button>
        </>
      )}
    </section>
  );
}

function PayEditor({ pay, onClose }: { pay: PayData; onClose: () => void }) {
  const [choice, setChoice] = useState<CycleChoice>(pay.cycle.kind);
  const [day, setDay] = useState(pay.cycle.kind === 'monthly' ? String(pay.cycle.day) : '');
  const [date, setDate] = useState(
    'anchor' in pay.cycle ? nextPaydayFor(pay.cycle, pay.region, today.value).nominal : '',
  );
  const [amount, setAmount] = useState(poundsText(pay.amount));
  const [region, setRegion] = useState<Region>(pay.region);
  const [error, setError] = useState<string | undefined>();

  async function submit(e: Event) {
    e.preventDefault();
    const cycle = cycleFrom(choice, day, date);
    const pence = amountFrom(amount);
    if (!cycle || !pence) {
      setError(!cycle ? 'Enter when you’re paid.' : 'Enter your take-home pay.');
      return;
    }
    const data: PayData = { ...pay, cycle, amount: pence, region };
    if (await save((s) => s.put('payRule', toJson(data), IDS.pay), { message: 'Pay saved.' }))
      onClose();
  }

  return (
    <form onSubmit={submit} noValidate class="panel-form">
      <Field label="How often">
        {(c) => (
          <select
            {...c}
            value={choice}
            onChange={(e) => setChoice(e.currentTarget.value as CycleChoice)}
          >
            {CYCLE_CHOICES.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        )}
      </Field>
      {choice === 'monthly' && (
        <Field label="Day of the month">
          {(c) => <TextInput {...c} inputMode="numeric" value={day} onValue={setDay} />}
        </Field>
      )}
      {choice !== 'monthly' && choice !== 'lastWorkingDay' && (
        <Field label="Next payday">
          {(c) => (
            <input
              {...c}
              type="date"
              value={date}
              onInput={(e) => setDate(e.currentTarget.value)}
            />
          )}
        </Field>
      )}
      <Field label="Take-home pay" error={error}>
        {(c) => <MoneyInput {...c} value={amount} onValue={setAmount} />}
      </Field>
      <Field label="Bank holidays">
        {(c) => (
          <select
            {...c}
            value={region}
            onChange={(e) => setRegion(e.currentTarget.value as Region)}
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {REGION_NAMES[r]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div class="actions">
        <button type="submit" class="btn btn-secondary btn-small">
          Save pay
        </button>
        <button type="button" class="link-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function SafetyPanel() {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[] | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null);
  const version = budget.value; // reload snapshots after each change

  useEffect(() => {
    const store = requireStore();
    void store.listSnapshots().then(setSnapshots, () => setSnapshots([]));
    void store
      .getMeta('lastBackupAt')
      .then((v) => setLastBackupAt(typeof v === 'number' ? v : null));
  }, [version]);

  async function restore(s: SnapshotSummary) {
    await save((store) => store.restoreSnapshot(s.id), {
      message: `Budget put back to how it was on ${formatMediumDate(s.day)}.`,
    });
  }

  return (
    <section class="panel" aria-labelledby="safety-h">
      <h2 id="safety-h">Keeping your budget safe</h2>
      <p>
        <strong>{health.value.message}.</strong> Every change is saved on this device as you make
        it.
      </p>
      <p class="muted small">
        {lastBackupAt ? `Last backup ${timeAgo(lastBackupAt, Date.now())}.` : 'No backup made yet.'}
      </p>
      <div class="actions">
        <BackupButton />
      </div>
      <Restore />
      <details>
        <summary>Undo a bad day</summary>
        <p class="muted small">
          A copy is kept each day for a week, and each week for a month. Putting one back keeps a
          copy of how things are now.
        </p>
        {snapshots && snapshots.length === 0 && (
          <p class="empty">
            No copies yet. One is made the first time you change something each day.
          </p>
        )}
        {snapshots && snapshots.length > 0 && (
          <ul class="list" data-testid="snapshots">
            {snapshots.map((s) => (
              <li key={s.id}>
                <span class="grow">
                  <span class="name">{formatMediumDate(s.day)}</span>
                  <br />
                  <span class="muted small">
                    {describeSummary({ counts: s.counts, lastChange: null })}
                    {s.reason === 'beforeRestore' ? ' · before a restore' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  class="link-btn"
                  aria-label={`Put back the budget from ${formatMediumDate(s.day)}`}
                  onClick={() => void restore(s)}
                >
                  Put back
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}

function CategoriesPanel() {
  const { categories } = budget.value;
  const [name, setName] = useState('');
  async function add(e: Event) {
    e.preventDefault();
    if (name.trim() === '') return;
    if (
      await save((s) => s.put('category', { name: name.trim(), planned: null }), {
        message: `${name.trim()} added.`,
      })
    )
      setName('');
  }
  async function rename(id: string, value: string) {
    if (value.trim() === '') return;
    const current = categories.find((c) => c.id === id);
    if (!current) return;
    // Keep the rest of the record, such as its monthly plan.
    await save((s) => s.put('category', toJson({ ...current.data, name: value.trim() }), id));
  }
  return (
    <section class="panel" aria-labelledby="cat-h">
      <details>
        <summary id="cat-h">Spending categories</summary>
        <ul class="list">
          {categories.map((c) => (
            <li key={c.id}>
              <input
                type="text"
                aria-label={`Rename ${c.data.name}`}
                defaultValue={c.data.name}
                onChange={(e) => void rename(c.id, e.currentTarget.value)}
              />
              <button
                type="button"
                class="link-btn"
                aria-label={`Remove ${c.data.name}`}
                onClick={() =>
                  void save((s) => s.remove(c.id), { message: `${c.data.name} removed.` })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={add} class="quick-spend" noValidate>
          <label for="new-category" class="visually-hidden">
            New category
          </label>
          <input
            id="new-category"
            type="text"
            placeholder="New category"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
          />
          <button type="submit" class="btn btn-secondary btn-small">
            Add
          </button>
        </form>
      </details>
    </section>
  );
}

function AppearancePanel() {
  const theme = budget.value.prefs.theme;
  const options: [Theme, string][] = [
    ['system', 'Match this device'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];
  return (
    <fieldset class="panel">
      <legend>
        <h2>Appearance</h2>
      </legend>
      <div class="seg">
        {options.map(([value, name]) => (
          <label class="choice" key={value}>
            <input
              type="radio"
              name="theme"
              checked={theme === value}
              onChange={() => void savePrefs({ theme: value })}
            />
            {name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AdvancedOptions() {
  const { prefs } = budget.value;
  const [buffer, setBuffer] = useState(poundsText(prefs.buffer));
  const [limit, setLimit] = useState(poundsText(prefs.overdraft.limit));
  const [error, setError] = useState<string | undefined>();

  function saveBuffer() {
    const pence = buffer.trim() === '' ? 0 : amountFrom(buffer);
    if (pence === null) return setError('Enter an amount, for example 50.');
    setError(undefined);
    if (pence !== prefs.buffer) void savePrefs({ buffer: pence });
  }
  function saveLimit() {
    const pence = limit.trim() === '' ? 0 : amountFrom(limit);
    if (pence !== null && pence !== prefs.overdraft.limit) {
      void savePrefs({ overdraft: { ...prefs.overdraft, limit: pence } });
    }
  }

  return (
    <div class="panel-form">
      <Field
        label="Buffer"
        hint="Money kept aside and never counted as safe to spend."
        error={error}
      >
        {(c) => <MoneyInput {...c} value={buffer} onValue={setBuffer} onChange={saveBuffer} />}
      </Field>
      <label class="choice">
        <input
          type="checkbox"
          checked={prefs.overdraft.include}
          onChange={(e) =>
            void savePrefs({ overdraft: { ...prefs.overdraft, include: e.currentTarget.checked } })
          }
        />
        Count my arranged overdraft in safe to spend
      </label>
      {prefs.overdraft.include && (
        <Field label="Arranged overdraft limit">
          {(c) => <MoneyInput {...c} value={limit} onValue={setLimit} onChange={saveLimit} />}
        </Field>
      )}
      <WhatsThis>
        <p>
          The buffer comes off before your number is worked out, so a little is always left. The
          overdraft is off by default: counting it means your number includes borrowed money.
        </p>
      </WhatsThis>
    </div>
  );
}

function DangerPanel() {
  const [confirming, setConfirming] = useState(false);
  if (budget.value.prefs.example) return null;
  return (
    <section class="panel" aria-labelledby="danger-h">
      <h2 id="danger-h">Start again</h2>
      {confirming ? (
        <div class="callout" role="alertdialog" aria-labelledby="danger-q">
          <p id="danger-q">
            Delete your budget from this device? A copy is kept for a month under “Undo a bad day”,
            here in Settings, once you set up again.
          </p>
          <div class="actions">
            <button
              type="button"
              class="btn btn-danger btn-small"
              onClick={() => void clearEverything()}
            >
              Delete my budget
            </button>
            <button type="button" class="link-btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" class="btn btn-danger btn-small" onClick={() => setConfirming(true)}>
          Delete my budget…
        </button>
      )}
    </section>
  );
}
