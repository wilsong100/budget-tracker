// The four-step setup (docs/PLAN.md, Differentiator 2): one question per screen, big targets,
// Back, progress dots. Nothing is required on step 3. Everything is saved in one change at
// the end, and step 4 is the Today screen itself.
import { useState } from 'preact/hooks';
import { BILL_PRESETS, formatShortDate, type Recurrence } from '../../domain';
import type { Change } from '../../storage';
import { Band, Field, MoneyInput, TextInput, WhatsThis } from '../components';
import {
  CYCLE_CHOICES,
  amountFrom,
  balanceFrom,
  cycleFrom,
  dayFrom,
  nextPaydayFor,
  type CycleChoice,
} from '../forms';
import { DEFAULT_PREFS, IDS, toJson, type BillData, type PayData } from '../model';
import { budget, finishSetup, stamp, today } from '../state';

interface BillPick {
  key: string;
  label: string;
  custom: boolean;
  councilTax: boolean;
  on: boolean;
  amount: string;
  day: string;
  instalments: '10' | '12';
}

const startingBills = (): BillPick[] =>
  BILL_PRESETS.map((p) => ({
    key: p.key,
    label: p.label,
    custom: false,
    councilTax: p.schedule === 'councilTax',
    on: false,
    amount: '',
    day: '',
    instalments: '10',
  }));

const REGION = 'england-and-wales' as const;
const TITLES = [
  'When do you get paid?',
  'What’s in your current account now?',
  'What comes out before payday?',
];

type Errors = Record<string, string>;

export function Setup({ onCancel }: { onCancel: () => void }) {
  const [step, setStep] = useState(1);
  const [choice, setChoice] = useState<CycleChoice>('monthly');
  const [payDay, setPayDay] = useState('');
  const [payDate, setPayDate] = useState('');
  const [pay, setPay] = useState('');
  const [balance, setBalance] = useState('');
  const [bills, setBills] = useState<BillPick[]>(startingBills);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const cycle = cycleFrom(choice, payDay, payDate);
  const payday = cycle ? nextPaydayFor(cycle, REGION, today.value) : null;

  function check(): Errors {
    const found: Errors = {};
    if (step === 1) {
      if (!cycle) {
        found['setup-when'] =
          choice === 'monthly'
            ? 'Enter the day of the month you’re paid, from 1 to 31.'
            : 'Enter the date of your next payday.';
      }
      if (!amountFrom(pay)) found['setup-pay'] = 'Enter your take-home pay, for example 1,850.';
    }
    if (step === 2 && balanceFrom(balance) === null) {
      found['setup-balance'] = 'Enter what’s in your current account, for example 412.50.';
    }
    if (step === 3) {
      for (const bill of bills.filter((b) => b.on)) {
        if (bill.label.trim() === '') found[`setup-label-${bill.key}`] = 'Give it a name.';
        if (amountFrom(bill.amount) === null)
          found[`setup-amount-${bill.key}`] = 'Enter an amount.';
        if (dayFrom(bill.day) === null)
          found[`setup-day-${bill.key}`] = 'Enter a day from 1 to 31.';
      }
    }
    return found;
  }

  function next(e: Event) {
    e.preventDefault();
    const found = check();
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    if (step < 3) setStep(step + 1);
    else void finish();
  }

  async function finish() {
    setSaving(true);
    const payData: PayData = {
      cycle: cycle!,
      overrides: {},
      amount: amountFrom(pay)!,
      region: REGION,
    };
    const changes: Change[] = [
      { type: 'payRule', id: IDS.pay, data: toJson(payData) },
      {
        type: 'setting',
        id: IDS.balance,
        data: { amount: balanceFrom(balance)!, date: today.value, at: stamp() },
      },
      {
        type: 'setting',
        id: IDS.prefs,
        data: toJson({ ...DEFAULT_PREFS, ...budget.value.prefs, example: false }),
      },
      ...bills
        .filter((b) => b.on)
        .map((b): Change => {
          const day = dayFrom(b.day)!;
          const rule: Recurrence = b.councilTax
            ? { kind: 'councilTax', instalments: b.instalments === '12' ? 12 : 10, day }
            : { kind: 'everyNMonths', months: 1, day, anchor: today.value };
          const data: BillData = {
            label: b.label.trim(),
            amount: amountFrom(b.amount)!,
            rule,
            method: 'directDebit',
            paid: {},
          };
          return { type: 'bill', data: toJson(data) };
        }),
    ];
    if (await finishSetup(changes)) location.hash = '#/today';
    else setSaving(false);
  }

  function back() {
    setErrors({});
    if (step === 1) onCancel();
    else setStep(step - 1);
  }

  const update = (key: string, change: Partial<BillPick>) =>
    setBills((all) => all.map((b) => (b.key === key ? { ...b, ...change } : b)));

  return (
    <main class="no-nav" id="content">
      <Band title={TITLES[step - 1]} focusKey={`setup-${step}`}>
        <div class="dots" role="img" aria-label={`Step ${step} of 4`}>
          {[1, 2, 3, 4].map((n) => (
            <i key={n} class={n <= step ? 'on' : ''} />
          ))}
        </div>
      </Band>
      <form class="wrap" onSubmit={next} noValidate>
        {step === 1 && (
          <>
            <fieldset class="panel">
              <legend>How often?</legend>
              <div class="choices">
                {CYCLE_CHOICES.map(([value, label]) => (
                  <label class="choice" key={value}>
                    <input
                      type="radio"
                      name="cycle"
                      value={value}
                      checked={choice === value}
                      onChange={() => setChoice(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div class="panel">
              {choice === 'monthly' && (
                <Field
                  id="setup-when"
                  label="Day of the month"
                  hint="The date you’re paid, 1 to 31."
                  error={errors['setup-when']}
                >
                  {(c) => (
                    <TextInput {...c} inputMode="numeric" value={payDay} onValue={setPayDay} />
                  )}
                </Field>
              )}
              {choice !== 'monthly' && choice !== 'lastWorkingDay' && (
                <Field id="setup-when" label="Next payday" error={errors['setup-when']}>
                  {(c) => (
                    <input
                      {...c}
                      type="date"
                      value={payDate}
                      onInput={(e) => setPayDate(e.currentTarget.value)}
                    />
                  )}
                </Field>
              )}
              <Field
                id="setup-pay"
                label="Take-home pay"
                hint="What reaches your account each payday."
                error={errors['setup-pay']}
              >
                {(c) => <MoneyInput {...c} value={pay} onValue={setPay} />}
              </Field>
              {payday && (
                <p data-testid="next-payday">
                  Next payday: <strong>{formatShortDate(payday.date)}</strong>
                  {payday.moved && (
                    <span class="muted">
                      {' '}
                      (moved from {formatShortDate(payday.nominal)}, a weekend or bank holiday)
                    </span>
                  )}
                </p>
              )}
              <p class="muted small">
                Weekends and bank holidays are handled for you, using England and Wales holidays.
                You can change this in Settings.
              </p>
            </div>
          </>
        )}

        {step === 2 && (
          <div class="panel">
            <Field
              id="setup-balance"
              label="Current account balance"
              hint="The figure in your banking app right now. Put a minus sign if you’re overdrawn."
              error={errors['setup-balance']}
            >
              {(c) => <MoneyInput {...c} value={balance} onValue={setBalance} />}
            </Field>
            <WhatsThis>
              <p>
                This is where your number starts. From here the app adds your pay and takes off
                bills and spends, so you don’t have to check your bank every day. You can update it
                any time from the Today screen.
              </p>
            </WhatsThis>
          </div>
        )}

        {step === 3 && (
          <>
            <p class="muted">
              Tick the ones you pay, then add the amount and the day it goes out. You can skip this
              and add bills later.
            </p>
            {bills.map((bill) => (
              <BillRow key={bill.key} bill={bill} errors={errors} update={update} />
            ))}
            <div>
              <button
                type="button"
                class="btn btn-quiet"
                onClick={() =>
                  setBills((all) => [
                    ...all,
                    {
                      key: `custom-${all.length}`,
                      label: '',
                      custom: true,
                      councilTax: false,
                      on: true,
                      amount: '',
                      day: '',
                      instalments: '10',
                    },
                  ])
                }
              >
                Add another
              </button>
            </div>
          </>
        )}

        <div class="step-nav">
          <button type="button" class="btn btn-quiet" onClick={back}>
            Back
          </button>
          <button type="submit" class="btn btn-primary" disabled={saving}>
            {step === 3 ? 'Show my number' : 'Next'}
          </button>
        </div>
      </form>
    </main>
  );
}

function BillRow({
  bill,
  errors,
  update,
}: {
  bill: BillPick;
  errors: Errors;
  update: (key: string, change: Partial<BillPick>) => void;
}) {
  const name = bill.label.trim() || 'this bill';
  const id = (field: string) => `setup-${field}-${bill.key}`;
  return (
    <div class="bill-pick">
      {bill.custom ? (
        <div class="details" style={{ paddingTop: '1rem' }}>
          <Field id={id('label')} label="Bill name" error={errors[id('label')]}>
            {(c) => (
              <TextInput
                {...c}
                value={bill.label}
                onValue={(label) => update(bill.key, { label })}
              />
            )}
          </Field>
        </div>
      ) : (
        <label class="choice">
          <input
            type="checkbox"
            checked={bill.on}
            onChange={(e) => update(bill.key, { on: e.currentTarget.checked })}
          />
          {bill.label}
        </label>
      )}
      {bill.on && (
        <div class="details">
          <div class="row">
            <Field id={id('amount')} label={`Amount for ${name}`} error={errors[id('amount')]}>
              {(c) => (
                <MoneyInput
                  {...c}
                  value={bill.amount}
                  onValue={(amount) => update(bill.key, { amount })}
                />
              )}
            </Field>
            <Field id={id('day')} label={`Day of the month for ${name}`} error={errors[id('day')]}>
              {(c) => (
                <TextInput
                  {...c}
                  inputMode="numeric"
                  value={bill.day}
                  onValue={(day) => update(bill.key, { day })}
                />
              )}
            </Field>
          </div>
          {bill.councilTax && (
            <Field label="Payments a year">
              {(c) => (
                <select
                  {...c}
                  value={bill.instalments}
                  onChange={(e) =>
                    update(bill.key, { instalments: e.currentTarget.value as '10' | '12' })
                  }
                >
                  <option value="10">10 (April to January)</option>
                  <option value="12">12 (April to March)</option>
                </select>
              )}
            </Field>
          )}
        </div>
      )}
    </div>
  );
}
