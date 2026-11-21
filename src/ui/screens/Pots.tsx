import { useState } from 'preact/hooks';
import {
  formatMediumDate,
  formatPence,
  isIsoDate,
  occurrences,
  potSaved,
  sinkingFundShare,
  type Pence,
} from '../../domain';
import { Band, Empty, Field, MoneyInput, TextInput, WhatsThis } from '../components';
import { amountFrom, dayFrom, poundsText } from '../forms';
import { potItem, toJson, type PotData, type Row } from '../model';
import { budget, save, stamp, today } from '../state';

/** Pots save on payday's date by default, so the money goes aside as soon as it arrives. */
function defaultSavingDay(): number | 'last' {
  const cycle = budget.value.pay?.cycle;
  if (!cycle) return 1;
  if (cycle.kind === 'monthly') return cycle.day;
  if (cycle.kind === 'lastWorkingDay') return 'last';
  return Number(cycle.anchor.slice(8));
}

function savedNow(row: Row<PotData>): Pence {
  const item = potItem(row);
  return item ? potSaved(row.data.saved, item, today.value) : row.data.saved.amount;
}

export function Pots() {
  const [editing, setEditing] = useState<Row<PotData> | 'new' | null>(null);
  const pots = budget.value.pots;
  if (editing) {
    return <PotEditor pot={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />;
  }
  return (
    <main id="content">
      <Band
        title="Pots"
        focusKey="pots"
        lead="Money put aside for something: a holiday, Christmas, car tax or a rainy day."
      />
      <div class="wrap">
        <div>
          <button type="button" class="btn btn-primary" onClick={() => setEditing('new')}>
            Add a pot
          </button>
        </div>
        <section class="panel" aria-labelledby="pots-h">
          <h2 id="pots-h">Your pots</h2>
          {pots.length === 0 ? (
            <Empty>
              Add a pot for something you’re saving for, and we’ll work out what to put aside each
              month.
            </Empty>
          ) : (
            <ul class="list" data-testid="pot-list">
              {pots.map((row) => {
                const saved = savedNow(row);
                const { target, targetDate, amount } = row.data;
                const share = Math.min(100, target ? Math.floor((saved * 100) / target) : 0);
                return (
                  <li key={row.id}>
                    <span class="grow">
                      <span class="name">{row.data.label}</span>
                      <br />
                      <span class="small">
                        {target
                          ? `${formatPence(saved)} of ${formatPence(target)}`
                          : `${formatPence(saved)} saved`}
                        {targetDate && (
                          <span class="muted"> · by {formatMediumDate(targetDate)}</span>
                        )}
                      </span>
                      {target && (
                        <span
                          class="progress"
                          role="img"
                          aria-label={`${share}% saved`}
                          style={{ display: 'block', marginTop: '0.4rem' }}
                        >
                          <i style={{ width: `${share}%` }} />
                        </span>
                      )}
                      <span class="muted small" style={{ display: 'block', marginTop: '0.3rem' }}>
                        {amount > 0 ? `${formatPence(amount)} a month` : 'Topped up by hand'}
                      </span>
                    </span>
                    <button
                      type="button"
                      class="link-btn"
                      aria-label={`Edit ${row.data.label}`}
                      onClick={() => setEditing(row)}
                    >
                      Edit
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <WhatsThis>
          <p>
            A pot’s monthly saving is kept aside from your number like a bill. Give it a target and
            a date and we’ll suggest how much to save each month to get there.
          </p>
        </WhatsThis>
      </div>
    </main>
  );
}

function PotEditor({ pot, onClose }: { pot: Row<PotData> | null; onClose: () => void }) {
  const savingDay =
    pot?.data.rule?.kind === 'everyNMonths' ? pot.data.rule.day : defaultSavingDay();
  const [label, setLabel] = useState(pot?.data.label ?? '');
  const [target, setTarget] = useState(poundsText(pot?.data.target ?? null));
  const [saved, setSaved] = useState(pot ? poundsText(savedNow(pot)) : '');
  const [targetDate, setTargetDate] = useState(pot?.data.targetDate ?? '');
  const [monthly, setMonthly] = useState(pot ? poundsText(pot.data.amount) : '');
  const [monthlyTouched, setMonthlyTouched] = useState(pot !== null);
  const [day, setDay] = useState(savingDay === 'last' ? '31' : String(savingDay));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Suggest the monthly saving from the target and date until the user types their own.
  const suggestion = (() => {
    const t = amountFrom(target);
    const d = dayFrom(day);
    if (!t || !isIsoDate(targetDate) || targetDate <= today.value || d === null) return null;
    return sinkingFundShare(
      {
        target: t,
        saved: amountFrom(saved) ?? 0,
        targetDate,
        day: savingDay === 'last' && d === 31 ? 'last' : d,
      },
      today.value,
    ).share;
  })();
  const monthlyText = monthlyTouched ? monthly : poundsText(suggestion);

  async function submit(e: Event) {
    e.preventDefault();
    const found: Record<string, string> = {};
    const t = target.trim() === '' ? null : amountFrom(target);
    const s = saved.trim() === '' ? 0 : amountFrom(saved);
    const m = monthlyText.trim() === '' ? 0 : amountFrom(monthlyText);
    const d = dayFrom(day);
    if (label.trim() === '') found['pot-name'] = 'Give the pot a name.';
    if (target.trim() !== '' && !t) found['pot-target'] = 'Enter a target, for example 600.';
    if (s === null) found['pot-saved'] = 'Enter what’s in the pot, for example 120.';
    if (targetDate !== '' && !isIsoDate(targetDate)) found['pot-date'] = 'Enter a date.';
    if (m === null) found['pot-monthly'] = 'Enter an amount, or leave it blank.';
    if (m && d === null) found['pot-day'] = 'Enter a day of the month from 1 to 31.';
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    const day1 = savingDay === 'last' && d === 31 ? 'last' : d!;
    const sameRule =
      pot?.data.rule?.kind === 'everyNMonths' &&
      pot.data.rule.day === day1 &&
      pot.data.amount === m;
    const data: PotData = {
      label: label.trim(),
      target: t,
      targetDate: targetDate || null,
      saved: { amount: s!, date: today.value, at: stamp() },
      amount: m!,
      rule: m
        ? sameRule
          ? pot!.data.rule
          : { kind: 'everyNMonths', months: 1, day: day1, anchor: today.value }
        : null,
      paid: pot?.data.paid ?? {},
    };
    const ok = await save((st) => st.put('pot', toJson(data), pot?.id), {
      message: `${data.label} saved.`,
    });
    if (ok) onClose();
  }

  async function remove() {
    if (!pot) return;
    const ok = await save((s) => s.remove(pot.id), {
      message: `${pot.data.label} deleted.`,
      undo: async () => {
        await save((s) => s.put('pot', toJson(pot.data), pot.id));
      },
    });
    if (ok) onClose();
  }

  const dates =
    suggestion !== null && isIsoDate(targetDate) && dayFrom(day) !== null
      ? occurrences(
          { kind: 'everyNMonths', months: 1, day: dayFrom(day)!, anchor: today.value },
          today.value,
          targetDate,
        ).length
      : 0;

  return (
    <main id="content">
      <Band
        title={pot ? `Edit ${pot.data.label}` : 'Add a pot'}
        focusKey={pot ? `edit-${pot.id}` : 'new-pot'}
      />
      <form class="wrap" onSubmit={submit} noValidate>
        <div class="panel">
          <Field id="pot-name" label="Name" error={errors['pot-name']}>
            {(c) => <TextInput {...c} value={label} onValue={setLabel} />}
          </Field>
          <Field id="pot-target" label="Target" hint="Optional." error={errors['pot-target']}>
            {(c) => <MoneyInput {...c} value={target} onValue={setTarget} />}
          </Field>
          <Field id="pot-saved" label="Saved so far" error={errors['pot-saved']}>
            {(c) => <MoneyInput {...c} value={saved} onValue={setSaved} />}
          </Field>
          <Field id="pot-date" label="Needed by" hint="Optional." error={errors['pot-date']}>
            {(c) => (
              <input
                {...c}
                type="date"
                value={targetDate}
                onInput={(e) => setTargetDate(e.currentTarget.value)}
              />
            )}
          </Field>
        </div>
        <div class="panel">
          <Field
            id="pot-monthly"
            label="Save each month"
            hint={
              suggestion !== null && !monthlyTouched
                ? `Suggested: ${dates} payments to reach the target in time.`
                : 'Leave blank to top it up by hand.'
            }
            error={errors['pot-monthly']}
          >
            {(c) => (
              <MoneyInput
                {...c}
                value={monthlyText}
                onValue={(v) => {
                  setMonthlyTouched(true);
                  setMonthly(v);
                }}
              />
            )}
          </Field>
          <Field
            id="pot-day"
            label="On day of the month"
            hint="Payday’s date by default."
            error={errors['pot-day']}
          >
            {(c) => <TextInput {...c} inputMode="numeric" value={day} onValue={setDay} />}
          </Field>
        </div>
        <div class="actions">
          <button type="submit" class="btn btn-primary">
            Save pot
          </button>
          <button type="button" class="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          {pot && (
            <button type="button" class="btn btn-danger" onClick={() => void remove()}>
              Delete pot
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
