import { compareIso, diffDays, toDayNumber, type IsoDate } from './dates';
import { assertNonNegativePence, assertPence, sumPence, type Pence } from './money';
import { occurrences, type Recurrence } from './recurrence';

/** A single bill or pot payment that hasn't happened yet. */
export interface Commitment {
  /** Unique per occurrence: `${id}:${date}`. Used to mark it paid. */
  key: string;
  label: string;
  kind: 'bill' | 'pot';
  date: IsoDate;
  /** A positive amount going out. */
  amount: Pence;
}

export interface SafeToSpendInput {
  today: IsoDate;
  nextPayday: IsoDate;
  /** What's in the current account now. */
  balance: Pence;
  /** Unpaid commitments. Those dated after the next payday are left out. */
  commitments: readonly Commitment[];
  /** Money to keep aside, a user setting (default £0). */
  buffer: Pence;
  /** "Count my overdraft in safe to spend" is off by default. */
  overdraft: { include: boolean; limit: Pence };
}

export interface BreakdownLine {
  kind: 'balance' | 'bill' | 'pot' | 'buffer' | 'overdraft';
  label: string;
  /** Signed: money in is positive, money out is negative. The lines add up to leftUntilPayday. */
  amount: Pence;
  date?: IsoDate;
}

export interface SafeToSpend {
  leftUntilPayday: Pence;
  /** Days from today up to the day before payday, counting today. */
  daysUntilPayday: number;
  /** leftUntilPayday ÷ daysUntilPayday, always rounded down. */
  safeToday: Pence;
  lines: BreakdownLine[];
}

/**
 * The safe-to-spend calculation from docs/PLAN.md:
 *
 *   left_until_payday = balance − unpaid bills and pot payments due on or before payday
 *                       − buffer + arranged overdraft (if switched on)
 *   safe_today        = left_until_payday ÷ days until payday (counting today)
 */
export function safeToSpend(input: SafeToSpendInput): SafeToSpend {
  const { today, nextPayday, balance, buffer, overdraft } = input;
  toDayNumber(today);
  const daysUntilPayday = diffDays(nextPayday, today);
  if (daysUntilPayday < 1) throw new RangeError('next payday must be after today');
  assertPence(balance, 'balance');
  assertNonNegativePence(buffer, 'buffer');
  assertNonNegativePence(overdraft.limit, 'overdraft limit');

  const due = input.commitments
    .filter((c) => c.date <= nextPayday)
    .map((c) => {
      assertNonNegativePence(c.amount, `amount for ${c.label}`);
      return c;
    })
    .sort((a, b) => compareIso(a.date, b.date) || a.label.localeCompare(b.label, 'en-GB'));

  const lines: BreakdownLine[] = [
    { kind: 'balance', label: 'In your account now', amount: balance },
    ...due.map((c) => ({ kind: c.kind, label: c.label, amount: -c.amount, date: c.date })),
  ];
  if (buffer > 0) lines.push({ kind: 'buffer', label: 'Buffer', amount: -buffer });
  if (overdraft.include && overdraft.limit > 0) {
    lines.push({ kind: 'overdraft', label: 'Arranged overdraft', amount: overdraft.limit });
  }

  const leftUntilPayday = sumPence(lines.map((line) => line.amount));
  return {
    leftUntilPayday,
    daysUntilPayday,
    safeToday: Math.floor(leftUntilPayday / daysUntilPayday),
    lines,
  };
}

/** Something that recurs and costs money: a bill or a pot contribution. */
export interface RecurringItem {
  id: string;
  label: string;
  kind: 'bill' | 'pot';
  amount: Pence;
  rule: Recurrence;
}

/**
 * The unpaid commitments from today to the next payday, inclusive. Anything dated before today
 * is taken to have left the account already. `paid` holds the keys the user has ticked off.
 */
export function dueCommitments(
  items: readonly RecurringItem[],
  today: IsoDate,
  nextPayday: IsoDate,
  paid: ReadonlySet<string>,
): Commitment[] {
  return items
    .flatMap((item) =>
      occurrences(item.rule, today, nextPayday).map((date) => ({
        key: `${item.id}:${date}`,
        label: item.label,
        kind: item.kind,
        date,
        amount: item.amount,
      })),
    )
    .filter((c) => !paid.has(c.key))
    .sort((a, b) => compareIso(a.date, b.date));
}
