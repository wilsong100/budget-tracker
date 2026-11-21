import { useState } from 'preact/hooks';
import {
  budgetToday,
  compareIso,
  formatPence,
  formatShortDate,
  nextBills,
  paidUntil,
  type Commitment,
} from '../../domain';
import { BackupButton } from '../backup';
import { Band, Field, MoneyInput, WhatsThis } from '../components';
import { balanceFrom, poundsText } from '../forms';
import { IDS, budgetInput, splitKey, toJson, type BillData, type PotData } from '../model';
import { SpendLogger } from '../spends';
import {
  backupReminder,
  budget,
  clearEverything,
  save,
  snoozeBackupReminder,
  stamp,
  today,
} from '../state';

export function Today() {
  const b = budget.value;
  if (!b.pay || !b.balance) return null;
  const input = budgetInput({ ...b, pay: b.pay, balance: b.balance }, today.value);
  const view = budgetToday(input);
  const over = view.leftToday < 0;
  const days = view.daysUntilPayday;
  const [nextBill] = nextBills(input.items, today.value, 1);
  // Unpaid and ticked-off items together, in date order, so a tick doesn't make a row vanish.
  const rows = [
    ...view.upcoming.map((c) => ({ c, paid: false })),
    ...paidUntil(input.items, today.value, view.nextPayday.date).map((c) => ({ c, paid: true })),
  ].sort((a, b) => compareIso(a.c.date, b.c.date) || a.c.label.localeCompare(b.c.label, 'en-GB'));

  return (
    <main id="content">
      <Band title="Today" focusKey="today">
        <p class="hero-label">{over ? 'Over today’s share by' : 'Safe to spend today'}</p>
        <p class={`hero-number ${over ? 'over' : ''}`} data-testid="safe-today">
          {formatPence(Math.abs(view.leftToday))}
        </p>
        <p class="hero-line" data-testid="payday-line">
          {days === 1 ? '1 day' : `${days} days`} until payday on{' '}
          {formatShortDate(view.nextPayday.date)}.
          {view.spentToday > 0 && (
            <span data-testid="spent-today">
              {' '}
              Spent today: {formatPence(view.spentToday)} of {formatPence(view.allowance)}.
            </span>
          )}
        </p>
        <p class="hero-line">
          {over
            ? 'That’s fine: it’s spread across the days left until payday.'
            : 'Spend less today and tomorrow’s number goes up.'}
        </p>
      </Band>
      <div class="wrap">
        {b.prefs.example && (
          <div class="callout" data-testid="example-banner">
            <p>These are example numbers, so you can look around.</p>
            <button
              type="button"
              class="btn btn-secondary btn-small"
              onClick={() => void clearEverything()}
            >
              Clear the example
            </button>
          </div>
        )}
        {backupReminder.value && !b.prefs.example && (
          <div class="callout" data-testid="backup-reminder">
            <p>It’s been a while since your last backup. One tap keeps a copy safe.</p>
            <div class="actions">
              <BackupButton />
              <button type="button" class="link-btn" onClick={() => void snoozeBackupReminder()}>
                Not now
              </button>
            </div>
          </div>
        )}

        <SpendLogger quick />

        <section class="panel" aria-labelledby="worked-out">
          <details>
            <summary id="worked-out">How is this worked out?</summary>
            <table class="breakdown" data-testid="breakdown">
              <caption class="visually-hidden">What goes into the number</caption>
              <tbody>
                {view.safe.lines.map((line, i) => (
                  <tr key={i}>
                    <td>
                      {line.label}
                      {line.date && <span class="muted"> · {formatShortDate(line.date)}</span>}
                    </td>
                    <td>{formatPence(line.amount, { sign: i === 0 ? 'auto' : 'always' })}</td>
                  </tr>
                ))}
                <tr class="total">
                  <td>Left until payday</td>
                  <td>{formatPence(view.safe.leftUntilPayday)}</td>
                </tr>
                <tr>
                  <td>Divided by {days === 1 ? '1 day' : `${days} days`}, counting today</td>
                  <td>{formatPence(view.allowance)} a day</td>
                </tr>
                {view.spentToday > 0 && (
                  <tr>
                    <td>Spent today</td>
                    <td>{formatPence(-view.spentToday)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <p class="muted small">
              Bills after payday come out of your next pay, so they aren’t counted here. Amounts are
              rounded down, so you’re never told you have more than you do.
            </p>
          </details>
        </section>

        <section class="panel" aria-labelledby="before-payday">
          <h2 id="before-payday">Before payday</h2>
          {rows.length === 0 ? (
            <p class="empty">Nothing else goes out before payday.</p>
          ) : (
            <ul class="list">
              {rows.map(({ c, paid }) => (
                <CommitmentRow key={c.key} c={c} paid={paid} />
              ))}
            </ul>
          )}
          {rows.length === 0 && nextBill && (
            <p class="muted small">
              Next bill after that: {nextBill.label} on {formatShortDate(nextBill.date)}.
            </p>
          )}
        </section>

        <section class="panel" aria-labelledby="balance-h">
          <h2 id="balance-h">Your account</h2>
          <BalanceEditor balance={view.balance} />
        </section>

        <WhatsThis>
          <p>
            Your number is what’s in your account, minus the bills and pot savings due before
            payday, shared out over the days left. Log what you spend and it keeps up. Update your
            balance now and then to keep it exact.
          </p>
        </WhatsThis>
      </div>
    </main>
  );
}

function CommitmentRow({ c, paid }: { c: Commitment; paid: boolean }) {
  const { id, date } = splitKey(c.key);
  const when = formatShortDate(date);
  const label = `Mark ${c.label} on ${when} as ${c.kind === 'bill' ? 'paid' : 'saved'}`;

  async function setPaid(on: boolean) {
    const b = budget.value;
    const rows = c.kind === 'bill' ? b.bills : b.pots;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const paidMap: Record<string, number> = { ...row.data.paid };
    if (on) paidMap[date] = stamp();
    else delete paidMap[date];
    const data: BillData | PotData = { ...row.data, paid: paidMap };
    await save((s) => s.put(c.kind, toJson(data), id));
  }

  return (
    <li class={paid ? 'done' : ''}>
      <input
        type="checkbox"
        class="tick"
        aria-label={label}
        checked={paid}
        onChange={(e) => void setPaid(e.currentTarget.checked)}
      />
      <span class="grow">
        <span class="name">{c.label}</span>
        <span class="muted small">
          {' '}
          · {when}
          {c.kind === 'pot' && ' · to a pot'}
          {paid && (c.kind === 'bill' ? ' · paid' : ' · saved')}
        </span>
      </span>
      <span class="amount">{formatPence(c.amount)}</span>
    </li>
  );
}

function BalanceEditor({ balance }: { balance: number }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();

  if (!editing) {
    return (
      <>
        <p>
          Should be about <strong>{formatPence(balance)}</strong> now, from your last balance, pay,
          bills and spends.
        </p>
        <button
          type="button"
          class="btn btn-quiet btn-small"
          onClick={() => {
            setText(poundsText(balance));
            setEditing(true);
          }}
        >
          Update balance
        </button>
      </>
    );
  }

  async function submit(e: Event) {
    e.preventDefault();
    const amount = balanceFrom(text);
    if (amount === null) {
      setError('Enter the figure in your banking app, for example 412.50.');
      return;
    }
    const ok = await save(
      (s) => s.put('setting', { amount, date: today.value, at: stamp() }, IDS.balance),
      { message: `Balance set to ${formatPence(amount)}.` },
    );
    if (ok) setEditing(false);
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field
        label="Current account balance"
        hint="The figure in your banking app right now."
        error={error}
      >
        {(c) => <MoneyInput {...c} value={text} onValue={setText} />}
      </Field>
      <div class="actions" style={{ marginTop: '0.75rem' }}>
        <button type="submit" class="btn btn-secondary btn-small">
          Save balance
        </button>
        <button type="button" class="link-btn" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
