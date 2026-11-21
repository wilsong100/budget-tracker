import { workingDayOnOrAfter, workingDayOnOrBefore, type BankHolidays } from './bankHolidays';
import {
  addDays,
  dateInMonth,
  diffDays,
  fromMonthIndex,
  maxDate,
  minDate,
  monthIndex,
  parseIso,
  toDayNumber,
  type IsoDate,
} from './dates';

/**
 * When something happens: a bill, a pot contribution or a payday.
 * Series run in both directions from their anchor, limited by optional start and end dates.
 */
export type Recurrence = (
  | { kind: 'once'; date: IsoDate }
  /** Weekly, fortnightly or 4-weekly, from any known occurrence. */
  | { kind: 'everyNWeeks'; weeks: 1 | 2 | 4; anchor: IsoDate }
  /** Monthly, quarterly, six-monthly or yearly, in the anchor's month and every n months from it. */
  | { kind: 'everyNMonths'; months: 1 | 3 | 6 | 12; day: number | 'last'; anchor: IsoDate }
  /** Council tax: 10 instalments April to January, or 12 April to March. */
  | { kind: 'councilTax'; instalments: 10 | 12; day: number | 'last' }
) & { start?: IsoDate; end?: IsoDate };

/** What to do when a date lands on a weekend or bank holiday. */
export type Adjustment = 'none' | 'previous' | 'next';

export interface Occurrence {
  /** The date the rule gives. */
  nominal: IsoDate;
  /** The date after moving off a non-working day. */
  date: IsoDate;
}

function nominalBetween(rule: Recurrence, from: IsoDate, to: IsoDate): IsoDate[] {
  switch (rule.kind) {
    case 'once':
      return [rule.date];

    case 'everyNWeeks': {
      if (![1, 2, 4].includes(rule.weeks))
        throw new RangeError(`weeks must be 1, 2 or 4, got ${rule.weeks}`);
      const step = rule.weeks * 7;
      const behind = diffDays(from, rule.anchor);
      let day = addDays(rule.anchor, Math.ceil(behind / step) * step);
      const dates: IsoDate[] = [];
      while (day <= to) {
        dates.push(day);
        day = addDays(day, step);
      }
      return dates;
    }

    case 'everyNMonths': {
      if (![1, 3, 6, 12].includes(rule.months)) {
        throw new RangeError(`months must be 1, 3, 6 or 12, got ${rule.months}`);
      }
      const anchor = parseIso(rule.anchor);
      const anchorIndex = monthIndex(anchor.year, anchor.month);
      return eachMonth(from, to)
        .filter(
          (index) => (((index - anchorIndex) % rule.months) + rule.months) % rule.months === 0,
        )
        .map((index) => {
          const { year, month } = fromMonthIndex(index);
          return dateInMonth(year, month, rule.day);
        });
    }

    case 'councilTax': {
      if (rule.instalments !== 10 && rule.instalments !== 12) {
        throw new RangeError(`instalments must be 10 or 12, got ${String(rule.instalments)}`);
      }
      // 10 instalments skip February and March.
      const skip = rule.instalments === 10 ? [2, 3] : [];
      return eachMonth(from, to)
        .map(fromMonthIndex)
        .filter(({ month }) => !skip.includes(month))
        .map(({ year, month }) => dateInMonth(year, month, rule.day));
    }

    default:
      throw new RangeError(`unknown recurrence ${JSON.stringify(rule)}`);
  }
}

function eachMonth(from: IsoDate, to: IsoDate): number[] {
  const a = parseIso(from);
  const b = parseIso(to);
  const indexes: number[] = [];
  for (let i = monthIndex(a.year, a.month); i <= monthIndex(b.year, b.month); i++) indexes.push(i);
  return indexes;
}

/** Every date the rule gives from `from` to `to`, inclusive, in order. */
export function occurrences(rule: Recurrence, from: IsoDate, to: IsoDate): IsoDate[] {
  toDayNumber(from);
  toDayNumber(to);
  const lower = rule.start ? maxDate(from, rule.start) : from;
  const upper = rule.end ? minDate(to, rule.end) : to;
  if (lower > upper) return [];
  return nominalBetween(rule, lower, upper).filter((date) => date >= lower && date <= upper);
}

/** How far a date can move off a run of non-working days (Christmas plus a weekend). */
const SHIFT_MARGIN_DAYS = 7;

/**
 * Occurrences after moving off weekends and bank holidays, kept if the moved date is in range.
 * A date just outside the range can move into it (1 January → 31 December), so the search
 * looks a week either side.
 */
export function adjustedOccurrences(
  rule: Recurrence,
  from: IsoDate,
  to: IsoDate,
  adjust: Adjustment,
  holidays: BankHolidays,
  margin = SHIFT_MARGIN_DAYS,
): Occurrence[] {
  const move =
    adjust === 'previous'
      ? (d: IsoDate) => workingDayOnOrBefore(d, holidays)
      : adjust === 'next'
        ? (d: IsoDate) => workingDayOnOrAfter(d, holidays)
        : (d: IsoDate) => d;
  return occurrences(rule, addDays(from, -margin), addDays(to, margin))
    .map((nominal) => ({ nominal, date: move(nominal) }))
    .filter(({ date }) => date >= from && date <= to);
}
