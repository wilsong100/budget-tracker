import type { BankHolidays } from './bankHolidays';
import type { PayPlan } from './budget';
import { addDays, monthEnd, monthKey, monthStart, type IsoDate, type MonthKey } from './dates';
import { shiftMonth } from './calendar';
import { sumPence, type Pence } from './money';
import { extraPaydayMonths, paydaysBetween, type Payday, type PaySchedule } from './paydays';
import { dueCommitments, type Commitment, type RecurringItem } from './safeToSpend';

export interface PaydayCover {
  payday: Payday;
  /** The next payday after this one: this payday covers everything up to and including it. */
  until: IsoDate;
  /** Unpaid bills and pot payments from the day after payday to `until`. */
  commitments: Commitment[];
  total: Pence;
  /** Take-home pay less the total. Negative when the pay doesn't cover it. */
  left: Pence;
}

/** Long enough to hold `count + 1` paydays of the slowest cycle. */
const DAYS_PER_PAYDAY = 45;

/**
 * Which bills each coming payday has to cover, for the Payday view. It matches safe to spend:
 * money that arrives on a payday covers what's due after it, up to and including the next one.
 */
export function paydayPlan(input: {
  pay: PayPlan;
  holidays: BankHolidays;
  items: readonly RecurringItem[];
  /** Keys of occurrences already ticked off as paid. */
  paid: ReadonlySet<string>;
  today: IsoDate;
  count: number;
}): PaydayCover[] {
  const { pay, holidays, items, paid, today, count } = input;
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be at least 1');
  const paydays = paydaysBetween(
    pay.schedule,
    holidays,
    addDays(today, 1),
    addDays(today, DAYS_PER_PAYDAY * (count + 1)),
  ).slice(0, count + 1);
  return paydays.slice(0, count).map((payday, i) => {
    const until = paydays[i + 1]!.date;
    const commitments = dueCommitments(items, addDays(payday.date, 1), until, paid);
    const total = sumPence(commitments.map((c) => c.amount));
    return { payday, until, commitments, total, left: pay.amount - total };
  });
}

/**
 * Months from this one, over the next `months`, with more paydays than usual: 3 fortnightly,
 * 5 weekly or 2 four-weekly. Each month counts all its paydays, including any already past.
 */
export function extraPaydaysAhead(
  schedule: PaySchedule,
  holidays: BankHolidays,
  today: IsoDate,
  months: number,
): { month: MonthKey; count: number }[] {
  if (!Number.isInteger(months) || months < 1) throw new RangeError('months must be at least 1');
  const first = monthKey(today);
  const last = shiftMonth(first, months - 1);
  const years = new Set([monthStart(first).slice(0, 4), monthEnd(last).slice(0, 4)]);
  return [...years]
    .flatMap((year) => extraPaydayMonths(schedule, holidays, Number(year)))
    .filter(({ month }) => month >= first && month <= last);
}
