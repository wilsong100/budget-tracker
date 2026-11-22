import {
  addDays,
  bundledBankHolidays,
  extraPaydaysAhead,
  formatMonth,
  formatPence,
  formatShortDate,
  paidKeys,
  paydayPlan,
} from '../../domain';
import { Band, Empty, WhatsThis } from '../components';
import { budgetInput, isSetUp } from '../model';
import { budget, today } from '../state';

/** How many paydays ahead the view shows. */
const AHEAD = 6;

/** The Payday view: which bills each coming payday covers, and months with an extra payday. */
export function Paydays() {
  const b = budget.value;
  if (!isSetUp(b)) return null;
  const input = budgetInput(b, today.value);
  const holidays = bundledBankHolidays(b.pay.region);
  const plan = paydayPlan({
    pay: input.pay,
    holidays,
    items: input.items,
    paid: paidKeys(input.items),
    today: today.value,
    count: AHEAD,
  });
  const cycle = b.pay.cycle.kind;
  const varies = cycle === 'weekly' || cycle === 'fortnightly' || cycle === 'fourWeekly';
  const extra = varies ? extraPaydaysAhead(input.pay.schedule, holidays, today.value, 12) : [];

  return (
    <main id="content">
      <Band
        title="Payday view"
        focusKey="paydays"
        lead="What each payday has to cover, from the day after it up to the next one."
      />
      <div class="wrap">
        {varies && (
          <section class="panel" aria-labelledby="extra-h" data-testid="extra-paydays">
            <h2 id="extra-h">Months with an extra payday</h2>
            {extra.length === 0 ? (
              <p class="muted">None in the next 12 months.</p>
            ) : (
              <>
                <ul class="list">
                  {extra.map(({ month, count }) => (
                    <li key={month}>
                      <span class="grow name">{formatMonth(month)}</span>
                      <span class="amount">{count} paydays</span>
                    </li>
                  ))}
                </ul>
                <p class="muted small">
                  Bills are usually monthly, so a month with an extra payday leaves more over.
                </p>
              </>
            )}
          </section>
        )}

        {input.items.length === 0 ? (
          <section class="panel">
            <Empty>Add your bills, and this shows which payday covers each one.</Empty>
          </section>
        ) : (
          plan.map((cover) => (
            <section
              key={cover.payday.date}
              class="panel"
              data-testid="payday"
              aria-labelledby={`payday-${cover.payday.date}`}
            >
              <h2 id={`payday-${cover.payday.date}`}>
                Payday {formatShortDate(cover.payday.date)}
              </h2>
              <p class="muted small">
                Covers {formatShortDate(addDays(cover.payday.date, 1))} to{' '}
                {formatShortDate(cover.until)}
                {cover.payday.moved &&
                  ` · paid early, as ${formatShortDate(cover.payday.nominal)} isn’t a working day`}
              </p>
              {cover.commitments.length === 0 ? (
                <p>Nothing due.</p>
              ) : (
                <ul class="list">
                  {cover.commitments.map((c) => (
                    <li key={c.key}>
                      <span class="grow">
                        <span class="name">{c.label}</span>
                        <br />
                        <span class="muted small">
                          {formatShortDate(c.date)}
                          {c.kind === 'pot' ? ' · pot saving' : ''}
                        </span>
                      </span>
                      <span class="amount">{formatPence(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p class="cover-total">
                <span>
                  {formatPence(cover.total)} of {formatPence(input.pay.amount)} pay
                </span>
                <strong class={cover.left < 0 ? 'over' : undefined}>
                  {cover.left < 0
                    ? `${formatPence(-cover.left)} short`
                    : `${formatPence(cover.left)} left`}
                </strong>
              </p>
            </section>
          ))
        )}
        <WhatsThis>
          <p>
            Your pay covers bills from the day after payday up to the next payday, the same way your
            number on Today is worked out. Bills you’ve ticked off as paid are left out.
          </p>
        </WhatsThis>
      </div>
    </main>
  );
}
