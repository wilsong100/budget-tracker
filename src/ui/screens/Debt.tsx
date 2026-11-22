import { useState } from 'preact/hooks';
import {
  formatMonth,
  formatPence,
  interestSaved,
  monthKey,
  payoffOrder,
  planDebts,
  shiftMonth,
  sumPence,
  type Debt as DomainDebt,
  type Strategy,
} from '../../domain';
import { Band, Empty, Field, MoneyInput, TextInput, WhatsThis } from '../components';
import { amountFrom, aprFrom, aprText, poundsText } from '../forms';
import {
  debtsOf,
  IDS,
  ownOrder,
  toJson,
  type DebtData,
  type DebtPlanData,
  type Row,
} from '../model';
import { budget, save, today } from '../state';

const STRATEGIES: [Strategy, string, string][] = [
  ['avalanche', 'Highest interest first', 'Avalanche. Pays the least interest overall.'],
  [
    'snowball',
    'Smallest balance first',
    'Snowball. Clears a debt sooner, which helps you keep going.',
  ],
  ['custom', 'My own order', 'You choose which debt gets any extra money first.'],
];

function savePlan(plan: DebtPlanData): Promise<boolean> {
  return save((s) => s.put('setting', toJson(plan), IDS.debtPlan));
}

/** Debt payoff: snowball, avalanche or the user's own order (docs/PLAN.md). */
export function Debt() {
  const [editing, setEditing] = useState<Row<DebtData> | 'new' | null>(null);
  if (editing) {
    return (
      <DebtEditor debt={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
    );
  }
  const { debts } = budget.value;

  return (
    <main id="content">
      <Band
        title="Debt"
        focusKey="debt"
        lead="Credit cards, loans and pay-later plans, and when they’ll be paid off."
      />
      <div class="wrap">
        <div>
          <button type="button" class="btn btn-primary" onClick={() => setEditing('new')}>
            Add a debt
          </button>
        </div>
        <section class="panel" aria-labelledby="debts-h">
          <h2 id="debts-h">Your debts</h2>
          {debts.length === 0 ? (
            <Empty>
              Add a credit card, loan or pay-later plan to see when you’ll be debt-free.
            </Empty>
          ) : (
            <ul class="list" data-testid="debt-list">
              {debts.map((row) => (
                <li key={row.id}>
                  <span class="grow">
                    <span class="name">{row.data.name}</span>
                    <br />
                    <span class="muted small">
                      {aprText(row.data.aprBasisPoints)}% APR ·{' '}
                      {formatPence(row.data.minimumPayment)} a month minimum
                    </span>
                  </span>
                  <span class="amount">{formatPence(row.data.balance)}</span>
                  <button
                    type="button"
                    class="link-btn"
                    aria-label={`Edit ${row.data.name}`}
                    onClick={() => setEditing(row)}
                  >
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {debts.length > 0 && <PlanPanel />}
        <WhatsThis>
          <p>
            Each month every debt gets its minimum, and anything more goes to one debt at a time.
            When it’s cleared, its money moves on to the next. Balances are what you owe today;
            update them now and then from your statements.
          </p>
        </WhatsThis>
      </div>
    </main>
  );
}

function PlanPanel() {
  const b = budget.value;
  const plan = b.debtPlan;
  const debts = debtsOf(b);
  const ids = debts.map((d) => d.id);
  const order = ownOrder(ids, plan.order);
  const [monthly, setMonthly] = useState(poundsText(plan.monthly));
  const [error, setError] = useState<string | undefined>();
  const minimums = sumPence(debts.map((d) => d.minimumPayment));

  function saveMonthly() {
    const pence = monthly.trim() === '' ? 0 : amountFrom(monthly);
    if (pence === null) return setError('Enter an amount, for example 150.');
    setError(undefined);
    if (pence !== plan.monthly) void savePlan({ ...plan, monthly: pence });
  }

  function choose(strategy: Strategy) {
    // Own order starts from the order the plan was already using.
    const start =
      strategy === 'custom' && plan.strategy !== 'custom'
        ? payoffOrder(debts, plan.strategy)
        : order;
    void savePlan({ ...plan, strategy, order: start });
  }

  function move(index: number, by: -1 | 1) {
    const next = [...order];
    [next[index], next[index + by]] = [next[index + by]!, next[index]!];
    void savePlan({ ...plan, order: next });
  }

  const names = new Map(debts.map((d) => [d.id, d.name]));
  return (
    <section class="panel" aria-labelledby="plan-h">
      <h2 id="plan-h">Your plan</h2>
      <Field
        label="Paid towards debts each month"
        hint={`In total, including the minimums, which come to ${formatPence(minimums)}.`}
        error={error}
      >
        {(c) => <MoneyInput {...c} value={monthly} onValue={setMonthly} onChange={saveMonthly} />}
      </Field>
      <fieldset>
        <legend>Which debt gets extra money first</legend>
        <div class="choices">
          {STRATEGIES.map(([value, name, about]) => (
            <label class="choice" key={value}>
              <input
                type="radio"
                name="strategy"
                checked={plan.strategy === value}
                onChange={() => choose(value)}
              />
              <span>
                {name}
                <br />
                <span class="muted small">{about}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {plan.strategy === 'custom' && (
        <ol class="list order" data-testid="debt-order" aria-label="Your order">
          {order.map((id, i) => (
            <li key={id}>
              <span class="grow name">
                {i + 1}. {names.get(id)}
              </span>
              {i > 0 && (
                <button
                  type="button"
                  class="link-btn"
                  aria-label={`Move ${names.get(id)} up`}
                  onClick={() => move(i, -1)}
                >
                  Up
                </button>
              )}
              {i < order.length - 1 && (
                <button
                  type="button"
                  class="link-btn"
                  aria-label={`Move ${names.get(id)} down`}
                  onClick={() => move(i, 1)}
                >
                  Down
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <PlanResult debts={debts} plan={{ ...plan, order }} minimums={minimums} />
    </section>
  );
}

function PlanResult({
  debts,
  plan,
  minimums,
}: {
  debts: DomainDebt[];
  plan: DebtPlanData;
  minimums: number;
}) {
  // Payments start next month.
  const startMonth = shiftMonth(monthKey(today.value), 1);
  const options = plan.strategy === 'custom' ? { order: plan.order, startMonth } : { startMonth };
  let body;
  if (plan.monthly === 0) {
    body = (
      <p>
        Enter what you can pay each month, at least the minimums of {formatPence(minimums)}, to see
        when you’ll be debt-free.
      </p>
    );
  } else {
    const result = planDebts(debts, plan.monthly, plan.strategy, options);
    if (result.status === 'budgetBelowMinimums') {
      body = (
        <p class="over">
          {formatPence(plan.monthly)} is less than the minimum payments, {formatPence(minimums)} a
          month. Pay at least the minimums to avoid charges.
        </p>
      );
    } else if (result.status === 'neverPaysOff') {
      body = (
        <p class="over">
          At {formatPence(plan.monthly)} a month the interest keeps up with the payments, so this
          would take more than 50 years. Try paying more.
        </p>
      );
    } else {
      const minimumOnly = planDebts(debts, minimums, plan.strategy, options);
      const saved = interestSaved(debts, plan.monthly, plan.strategy, options);
      const names = new Map(debts.map((d) => [d.id, d.name]));
      const cleared = Object.entries(result.payoffMonth)
        .filter(([, month]) => month > 0)
        .sort((a, b) => a[1] - b[1]);
      body = (
        <>
          <p class="debt-free">
            Debt-free by <strong>{formatMonth(result.debtFreeMonth!)}</strong>
          </p>
          <p>
            {result.months} {result.months === 1 ? 'payment' : 'payments'} from{' '}
            {formatMonth(startMonth)}. You’ll pay {formatPence(result.totalInterest)} in interest.
          </p>
          {plan.monthly > minimums && (
            <p>
              {minimumOnly.status === 'ok'
                ? `Paying only the minimums: debt-free by ${formatMonth(minimumOnly.debtFreeMonth!)}. `
                : 'Paying only the minimums would never clear it. '}
              {saved !== null && saved > 0 && (
                <>
                  Paying {formatPence(plan.monthly)} a month saves{' '}
                  <strong>{formatPence(saved)} in interest</strong>.
                </>
              )}
            </p>
          )}
          {cleared.length > 1 && (
            <ul class="list">
              {cleared.map(([id, month]) => (
                <li key={id}>
                  <span class="grow name">{names.get(id)}</span>
                  <span class="muted">
                    paid off {formatMonth(shiftMonth(startMonth, month - 1))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    }
  }
  return (
    <div class="callout" data-testid="debt-plan" aria-live="polite">
      {body}
    </div>
  );
}

function DebtEditor({ debt, onClose }: { debt: Row<DebtData> | null; onClose: () => void }) {
  const [name, setName] = useState(debt?.data.name ?? '');
  const [balance, setBalance] = useState(poundsText(debt?.data.balance ?? null));
  const [apr, setApr] = useState(debt ? aprText(debt.data.aprBasisPoints) : '');
  const [minimum, setMinimum] = useState(poundsText(debt?.data.minimumPayment ?? null));
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: Event) {
    e.preventDefault();
    const owed = amountFrom(balance);
    const points = aprFrom(apr);
    const min = minimum.trim() === '' ? 0 : amountFrom(minimum);
    const found: Record<string, string> = {};
    if (name.trim() === '') found['debt-name'] = 'Give the debt a name.';
    if (owed === null || owed === 0)
      found['debt-balance'] = 'Enter what you owe, for example 1200.';
    if (points === null) found['debt-apr'] = 'Enter the rate as a percentage, for example 24.9.';
    if (min === null) found['debt-minimum'] = 'Enter the minimum payment, for example 36.';
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    const data: DebtData = {
      name: name.trim(),
      balance: owed!,
      aprBasisPoints: points!,
      minimumPayment: min!,
    };
    const ok = await save((s) => s.put('debt', toJson(data), debt?.id), {
      message: `${data.name} saved.`,
    });
    if (ok) onClose();
  }

  async function remove() {
    if (!debt) return;
    const ok = await save((s) => s.remove(debt.id), {
      message: `${debt.data.name} deleted.`,
      undo: async () => {
        await save((s) => s.put('debt', toJson(debt.data), debt.id));
      },
    });
    if (ok) onClose();
  }

  return (
    <main id="content">
      <Band
        title={debt ? `Edit ${debt.data.name}` : 'Add a debt'}
        focusKey={debt ? `edit-${debt.id}` : 'new-debt'}
      />
      <form class="wrap" onSubmit={submit} noValidate>
        <div class="panel">
          <Field id="debt-name" label="Name" error={errors['debt-name']}>
            {(c) => <TextInput {...c} value={name} onValue={setName} />}
          </Field>
          <Field id="debt-balance" label="Balance owed" error={errors['debt-balance']}>
            {(c) => <MoneyInput {...c} value={balance} onValue={setBalance} />}
          </Field>
          <Field
            id="debt-apr"
            label="Interest rate (APR)"
            hint="As a percentage, for example 24.9. Use 0 for an interest-free plan."
            error={errors['debt-apr']}
          >
            {(c) => <TextInput {...c} inputMode="decimal" value={apr} onValue={setApr} />}
          </Field>
          <Field
            id="debt-minimum"
            label="Minimum payment"
            hint="Each month, from your statement or agreement."
            error={errors['debt-minimum']}
          >
            {(c) => <MoneyInput {...c} value={minimum} onValue={setMinimum} />}
          </Field>
        </div>
        <div class="actions">
          <button type="submit" class="btn btn-primary">
            Save debt
          </button>
          <button type="button" class="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          {debt && (
            <button type="button" class="btn btn-danger" onClick={() => void remove()}>
              Delete debt
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
