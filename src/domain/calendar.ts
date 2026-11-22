import { addDays, dayOfWeek, monthEnd, monthKey, monthStart, addMonths } from './dates';
import type { IsoDate, MonthKey } from './dates';
import { sumPence, type Pence } from './money';
import { dueCommitments, type Commitment, type RecurringItem } from './safeToSpend';

export interface CalendarDay {
  date: IsoDate;
  /** False for the days from the months either side that fill the first and last weeks. */
  inMonth: boolean;
  payday: boolean;
  /** Bills and pot payments due that day, by label. Empty outside the month. */
  items: Commitment[];
  total: Pence;
}

/** A month key n months on (or back, if n is negative). */
export function shiftMonth(month: MonthKey, n: number): MonthKey {
  return monthKey(addMonths(monthStart(month), n));
}

/**
 * A month as Monday-start weeks for the bills calendar, with each day's bills and pot payments
 * and whether it's a payday. Every occurrence shows, ticked off or not.
 */
export function calendarMonth(
  month: MonthKey,
  items: readonly RecurringItem[],
  paydays: readonly IsoDate[],
): CalendarDay[][] {
  const first = monthStart(month);
  const last = monthEnd(month);
  const due = dueCommitments(items, first, last, new Set());
  const paid = new Set(paydays);

  const weeks: CalendarDay[][] = [];
  let day = addDays(first, 1 - dayOfWeek(first));
  while (day <= last) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const inMonth = day >= first && day <= last;
      const on = inMonth
        ? due.filter((c) => c.date === day).sort((a, b) => a.label.localeCompare(b.label, 'en-GB'))
        : [];
      week.push({
        date: day,
        inMonth,
        payday: inMonth && paid.has(day),
        items: on,
        total: sumPence(on.map((c) => c.amount)),
      });
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}
