import { useState } from 'preact/hooks';
import {
  bundledBankHolidays,
  calendarMonth,
  formatLongDate,
  formatMonth,
  formatPence,
  formatShortDate,
  monthEnd,
  monthKey,
  monthStart,
  paydaysBetween,
  type IsoDate,
  type MonthKey,
} from '../../domain';
import { Band, Empty, MonthNav, WhatsThis } from '../components';
import { budgetInput, isSetUp } from '../model';
import { budget, today } from '../state';
import { BillEditor } from './Bills';

const WEEKDAYS: [short: string, long: string][] = [
  ['Mon', 'Monday'],
  ['Tue', 'Tuesday'],
  ['Wed', 'Wednesday'],
  ['Thu', 'Thursday'],
  ['Fri', 'Friday'],
  ['Sat', 'Saturday'],
  ['Sun', 'Sunday'],
];

/** The bills calendar: a month grid. Tapping a day adds a bill on it (docs/PLAN.md). */
export function Calendar() {
  const [month, setMonth] = useState<MonthKey>(monthKey(today.value));
  const [adding, setAdding] = useState<IsoDate | null>(null);
  const b = budget.value;
  if (!isSetUp(b)) return null;

  if (adding) return <BillEditor bill={null} on={adding} onClose={() => setAdding(null)} />;

  const input = budgetInput(b, today.value);
  const paydays = paydaysBetween(
    input.pay.schedule,
    bundledBankHolidays(b.pay.region),
    monthStart(month),
    monthEnd(month),
  ).map((p) => p.date);
  const weeks = calendarMonth(month, input.items, paydays);
  const days = weeks.flat().filter((d) => d.inMonth && d.items.length > 0);

  return (
    <main id="content">
      <Band
        title="Calendar"
        focusKey="calendar"
        lead="Your bills and pot savings on the days they go out. Tap a day to add a bill."
      />
      <div class="wrap">
        <section class="panel" aria-label={`Bills in ${formatMonth(month)}`}>
          <MonthNav month={month} onMonth={setMonth} />
          <table class="cal">
            <thead>
              <tr>
                {WEEKDAYS.map(([short, long]) => (
                  <th key={short} scope="col">
                    <abbr title={long}>{short}</abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week[0]!.date}>
                  {week.map((day) => {
                    const dayNumber = Number(day.date.slice(8));
                    if (!day.inMonth) {
                      return (
                        <td key={day.date} class="out">
                          <span aria-hidden="true">{dayNumber}</span>
                        </td>
                      );
                    }
                    const what = [
                      formatLongDate(day.date),
                      day.payday ? 'payday' : '',
                      ...day.items.map((c) => `${c.label} ${formatPence(c.amount)}`),
                      'add a bill',
                    ].filter(Boolean);
                    return (
                      <td key={day.date}>
                        <button
                          type="button"
                          class={`cal-day${day.payday ? ' payday' : ''}`}
                          aria-label={what.join(', ')}
                          aria-current={day.date === today.value ? 'date' : undefined}
                          onClick={() => setAdding(day.date)}
                        >
                          <span class="cal-n">{dayNumber}</span>
                          {day.items.length > 0 && (
                            <span class="cal-dots" aria-hidden="true">
                              {day.items.slice(0, 3).map((c) => (
                                <i key={c.key} class={c.kind} />
                              ))}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p class="cal-key muted small" aria-hidden="true">
            <span class="key-payday" /> Payday <span class="key-bill" /> Bill{' '}
            <span class="key-pot" /> Pot saving
          </p>
        </section>

        <section class="panel" aria-labelledby="month-bills-h">
          <h2 id="month-bills-h">Due in {formatMonth(month)}</h2>
          {days.length === 0 ? (
            <Empty>
              {b.bills.length === 0
                ? 'Tap a day to add a bill, and it shows here on every day it’s due.'
                : `Nothing due in ${formatMonth(month)}. Tap a day to add a bill.`}
            </Empty>
          ) : (
            <ul class="list" data-testid="month-bills">
              {days.flatMap((day) =>
                day.items.map((c) => (
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
                )),
              )}
            </ul>
          )}
        </section>
        <WhatsThis>
          <p>
            Every bill and regular pot saving appears on each day it’s due, whether or not you’ve
            ticked it off. Paydays are marked, moved off weekends and bank holidays.
          </p>
        </WhatsThis>
      </div>
    </main>
  );
}
