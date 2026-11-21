import { addDays, dateInMonth, parseIso, type IsoDate } from './dates';
import { assertNonNegativePence, sumPence, type Pence } from './money';
import { occurrences } from './recurrence';

/** The amount to save each time so the target is met by the last saving date, rounded up. */
export function monthlyShare(target: Pence, saved: Pence, savingDates: number): Pence {
  assertNonNegativePence(target, 'target');
  assertNonNegativePence(saved, 'saved');
  if (!Number.isInteger(savingDates) || savingDates < 0) {
    throw new RangeError(`saving dates must be a whole number of 0 or more, got ${savingDates}`);
  }
  const remaining = Math.max(0, target - saved);
  return savingDates === 0 ? remaining : Math.ceil(remaining / savingDates);
}

export interface SinkingFund {
  target: Pence;
  saved: Pence;
  /** When the money is needed. */
  targetDate: IsoDate;
  /** Day of the month the saving goes in. */
  day: number | 'last';
}

/** A sinking fund's monthly share, counting saving dates from today up to the target date. */
export function sinkingFundShare(
  fund: SinkingFund,
  today: IsoDate,
): { share: Pence; savingDates: number } {
  const savingDates = occurrences(
    { kind: 'everyNMonths', months: 1, day: fund.day, anchor: today },
    today,
    fund.targetDate,
  ).length;
  return { share: monthlyShare(fund.target, fund.saved, savingDates), savingDates };
}

/** The UK tax year runs from 6 April to 5 April. */
export function taxYearStart(date: IsoDate): IsoDate {
  const { year } = parseIso(date);
  const thisYear = dateInMonth(year, 4, 6);
  return date >= thisYear ? thisYear : dateInMonth(year - 1, 4, 6);
}

export function taxYearEnd(date: IsoDate): IsoDate {
  return addDays(dateInMonth(parseIso(taxYearStart(date)).year + 1, 4, 6), -1);
}

/** For example '2026/27'. */
export function taxYearLabel(date: IsoDate): string {
  const { year } = parseIso(taxYearStart(date));
  return `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
}

export interface IsaAllowance {
  taxYear: string;
  used: Pence;
  remaining: Pence;
  over: Pence;
}

/**
 * How much of this tax year's ISA allowance is used. The allowance is a user setting,
 * so a change in the limit doesn't need an app update.
 */
export function isaAllowance(
  allowance: Pence,
  payments: readonly { date: IsoDate; amount: Pence }[],
  today: IsoDate,
): IsaAllowance {
  assertNonNegativePence(allowance, 'allowance');
  const start = taxYearStart(today);
  const end = taxYearEnd(today);
  const used = sumPence(
    payments.filter((p) => p.date >= start && p.date <= end).map((p) => p.amount),
  );
  return {
    taxYear: taxYearLabel(today),
    used,
    remaining: Math.max(0, allowance - used),
    over: Math.max(0, used - allowance),
  };
}
