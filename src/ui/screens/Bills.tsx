import { useState } from 'preact/hooks';
import {
  addDays,
  describeRecurrence,
  formatPence,
  formatShortDate,
  occurrences,
  type IsoDate,
} from '../../domain';
import { Band, Empty, Field, MoneyInput, TextInput, WhatsThis } from '../components';
import {
  BILL_SCHEDULES,
  amountFrom,
  poundsText,
  ruleFrom,
  scheduleOf,
  usesDayOfMonth,
  type BillSchedule,
} from '../forms';
import { toJson, type BillData, type PaymentMethod, type Row } from '../model';
import { budget, save, today } from '../state';

const METHODS: [PaymentMethod, string][] = [
  ['directDebit', 'Direct Debit'],
  ['standingOrder', 'Standing order'],
  ['card', 'Card payment'],
  ['other', 'Other'],
];

export function Bills() {
  const [editing, setEditing] = useState<Row<BillData> | 'new' | null>(null);
  const bills = budget.value.bills
    .map((row) => ({
      row,
      next: occurrences(row.data.rule, today.value, addDays(today.value, 400))[0],
    }))
    .sort((a, b) => (a.next ?? '9999').localeCompare(b.next ?? '9999'));

  if (editing) {
    return (
      <BillEditor bill={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
    );
  }

  return (
    <main id="content">
      <Band
        title="Bills"
        focusKey="bills"
        lead="Direct Debits, standing orders and anything else that comes out regularly."
      />
      <div class="wrap">
        <div>
          <button type="button" class="btn btn-primary" onClick={() => setEditing('new')}>
            Add a bill
          </button>
        </div>
        <section class="panel" aria-labelledby="bills-h">
          <h2 id="bills-h">Your bills</h2>
          {bills.length === 0 ? (
            <Empty>
              Add the bills that leave your account, like rent, council tax or your phone, so
              they’re kept aside.
            </Empty>
          ) : (
            <ul class="list" data-testid="bill-list">
              {bills.map(({ row, next }) => (
                <li key={row.id}>
                  <span class="grow">
                    <span class="name">{row.data.label}</span>
                    <br />
                    <span class="muted small">
                      {describeRecurrence(row.data.rule)}
                      {next ? ` · next ${formatShortDate(next)}` : ' · no more payments'}
                    </span>
                  </span>
                  <span class="amount">{formatPence(row.data.amount)}</span>
                  <button
                    type="button"
                    class="link-btn"
                    aria-label={`Edit ${row.data.label}`}
                    onClick={() => setEditing(row)}
                  >
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <WhatsThis>
          <p>
            Bills due before your next payday are kept aside from your number. Tick one off on the
            Today screen when it’s gone out early; otherwise it’s taken off on its date.
          </p>
        </WhatsThis>
      </div>
    </main>
  );
}

/** Adds or edits a bill. `on` starts a new bill on that date, from the calendar. */
export function BillEditor({
  bill,
  on,
  onClose,
}: {
  bill: Row<BillData> | null;
  on?: IsoDate;
  onClose: () => void;
}) {
  const start = bill
    ? scheduleOf(bill.data.rule)
    : {
        schedule: 'monthly' as BillSchedule,
        day: on ? String(Number(on.slice(8))) : '',
        date: on ?? '',
      };
  const [label, setLabel] = useState(bill?.data.label ?? '');
  const [amount, setAmount] = useState(poundsText(bill?.data.amount ?? null));
  const [schedule, setSchedule] = useState<BillSchedule>(start.schedule);
  const [day, setDay] = useState(start.day);
  const [date, setDate] = useState(start.date);
  const [method, setMethod] = useState<PaymentMethod>(bill?.data.method ?? 'directDebit');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: Event) {
    e.preventDefault();
    const pence = amountFrom(amount);
    const rule = ruleFrom(schedule, day, date, today.value);
    const found: Record<string, string> = {};
    if (label.trim() === '') found['bill-name'] = 'Give the bill a name.';
    if (pence === null || pence === 0)
      found['bill-amount'] = 'Enter the amount, for example 45.99.';
    if (!rule) {
      found['bill-when'] = usesDayOfMonth(schedule)
        ? 'Enter a day of the month from 1 to 31.'
        : 'Enter the date of the next payment.';
    }
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    const data: BillData = {
      label: label.trim(),
      amount: pence!,
      rule: rule!,
      method,
      paid: bill?.data.paid ?? {},
    };
    const ok = await save((s) => s.put('bill', toJson(data), bill?.id), {
      message: `${data.label} saved.`,
    });
    if (ok) onClose();
  }

  async function remove() {
    if (!bill) return;
    const ok = await save((s) => s.remove(bill.id), {
      message: `${bill.data.label} deleted.`,
      undo: async () => {
        await save((s) => s.put('bill', toJson(bill.data), bill.id));
      },
    });
    if (ok) onClose();
  }

  return (
    <main id="content">
      <Band
        title={bill ? `Edit ${bill.data.label}` : 'Add a bill'}
        focusKey={bill ? `edit-${bill.id}` : `new-bill${on ? `-${on}` : ''}`}
      />
      <form class="wrap" onSubmit={submit} noValidate>
        <div class="panel">
          <Field id="bill-name" label="Name" error={errors['bill-name']}>
            {(c) => <TextInput {...c} value={label} onValue={setLabel} />}
          </Field>
          <Field id="bill-amount" label="Amount" error={errors['bill-amount']}>
            {(c) => <MoneyInput {...c} value={amount} onValue={setAmount} />}
          </Field>
          <Field label="How often">
            {(c) => (
              <select
                {...c}
                value={schedule}
                onChange={(e) => setSchedule(e.currentTarget.value as BillSchedule)}
              >
                {BILL_SCHEDULES.map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {usesDayOfMonth(schedule) ? (
            <Field
              id="bill-when"
              label="Day of the month"
              hint="1 to 31. Short months use their last day."
              error={errors['bill-when']}
            >
              {(c) => <TextInput {...c} inputMode="numeric" value={day} onValue={setDay} />}
            </Field>
          ) : (
            <Field id="bill-when" label="Next payment" error={errors['bill-when']}>
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
          <Field label="Paid by">
            {(c) => (
              <select
                {...c}
                value={method}
                onChange={(e) => setMethod(e.currentTarget.value as PaymentMethod)}
              >
                {METHODS.map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <div class="actions">
          <button type="submit" class="btn btn-primary">
            Save bill
          </button>
          <button type="button" class="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          {bill && (
            <button type="button" class="btn btn-danger" onClick={() => void remove()}>
              Delete bill
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
