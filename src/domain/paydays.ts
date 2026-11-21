import type { BankHolidays } from './bankHolidays';
import { addDays, compareIso, diffDays, monthKey, type IsoDate, type MonthKey } from './dates';
import { adjustedOccurrences, type Recurrence } from './recurrence';

/**
 * UK pay cycles. A payday that lands on a weekend or bank holiday moves to the working day
 * before it. Universal Credit is a monthly payment on a fixed date and follows the same rule.
 */
export type PayCycle =
  | { kind: 'monthly'; day: number }
  | { kind: 'lastWorkingDay' }
  | { kind: 'fourWeekly' | 'fortnightly' | 'weekly'; anchor: IsoDate };

export interface PaySchedule {
  cycle: PayCycle;
  /** Per-payday overrides: nominal payday → the date the money actually arrives. */
  overrides?: Readonly<Record<IsoDate, IsoDate>>;
}

export interface Payday {
  nominal: IsoDate;
  date: IsoDate;
  /** True when the money arrives on a different day from the nominal one. */
  moved: boolean;
  overridden: boolean;
}

/** An override may move a payday by up to this many days. */
const MAX_OVERRIDE_DAYS = 31;

function toRecurrence(cycle: PayCycle): Recurrence {
  switch (cycle.kind) {
    case 'monthly':
      if (!Number.isInteger(cycle.day) || cycle.day < 1 || cycle.day > 31) {
        throw new RangeError(`monthly payday must be 1–31, got ${cycle.day}`);
      }
      return { kind: 'everyNMonths', months: 1, day: cycle.day, anchor: '2000-01-01' };
    case 'lastWorkingDay':
      // The month's last day, moved back to a working day.
      return { kind: 'everyNMonths', months: 1, day: 'last', anchor: '2000-01-01' };
    case 'weekly':
      return { kind: 'everyNWeeks', weeks: 1, anchor: cycle.anchor };
    case 'fortnightly':
      return { kind: 'everyNWeeks', weeks: 2, anchor: cycle.anchor };
    case 'fourWeekly':
      return { kind: 'everyNWeeks', weeks: 4, anchor: cycle.anchor };
  }
}

/** Every payday whose money arrives from `from` to `to`, inclusive, in date order. */
export function paydaysBetween(
  schedule: PaySchedule,
  holidays: BankHolidays,
  from: IsoDate,
  to: IsoDate,
): Payday[] {
  const overrides = schedule.overrides ?? {};
  for (const [nominal, date] of Object.entries(overrides)) {
    if (Math.abs(diffDays(date, nominal)) > MAX_OVERRIDE_DAYS) {
      throw new RangeError(`override for ${nominal} moves it more than ${MAX_OVERRIDE_DAYS} days`);
    }
  }
  return adjustedOccurrences(
    toRecurrence(schedule.cycle),
    addDays(from, -MAX_OVERRIDE_DAYS),
    addDays(to, MAX_OVERRIDE_DAYS),
    'previous',
    holidays,
  )
    .map(({ nominal, date }) => {
      const override = overrides[nominal];
      const actual = override ?? date;
      return {
        nominal,
        date: actual,
        moved: actual !== nominal,
        overridden: override !== undefined,
      };
    })
    .filter(({ date }) => date >= from && date <= to)
    .sort((a, b) => compareIso(a.date, b.date));
}

/** Long enough to contain at least one payday of any cycle. */
const SEARCH_DAYS = 45;

/** The next payday after today. On payday itself the money has arrived, so it's the one after. */
export function nextPayday(schedule: PaySchedule, holidays: BankHolidays, today: IsoDate): Payday {
  return paydaysBetween(schedule, holidays, addDays(today, 1), addDays(today, SEARCH_DAYS))[0]!;
}

/** The most recent payday on or before today: the start of the current pay period. */
export function previousPayday(
  schedule: PaySchedule,
  holidays: BankHolidays,
  today: IsoDate,
): Payday {
  return paydaysBetween(schedule, holidays, addDays(today, -SEARCH_DAYS), today).at(-1)!;
}

export function payPeriod(
  schedule: PaySchedule,
  holidays: BankHolidays,
  today: IsoDate,
): { start: Payday; next: Payday } {
  return {
    start: previousPayday(schedule, holidays, today),
    next: nextPayday(schedule, holidays, today),
  };
}

/** Paydays in a normal month for each cycle; more than this is an extra-payday month. */
const USUAL_PER_MONTH: Record<PayCycle['kind'], number> = {
  monthly: 1,
  lastWorkingDay: 1,
  fourWeekly: 1,
  fortnightly: 2,
  weekly: 4,
};

/** Months in a year with more paydays than usual: 3 fortnightly, 5 weekly or 2 four-weekly. */
export function extraPaydayMonths(
  schedule: PaySchedule,
  holidays: BankHolidays,
  year: number,
): { month: MonthKey; count: number }[] {
  const counts = new Map<MonthKey, number>();
  for (const payday of paydaysBetween(schedule, holidays, `${year}-01-01`, `${year}-12-31`)) {
    const key = monthKey(payday.date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const usual = USUAL_PER_MONTH[schedule.cycle.kind];
  return [...counts]
    .filter(([, count]) => count > usual)
    .map(([month, count]) => ({ month, count }));
}
