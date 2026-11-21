import type { BankHolidays } from './bankHolidays';
import { addDays, compareIso, type IsoDate } from './dates';
import { sumPence, type Pence } from './money';
import { nextPayday, paydaysBetween, type Payday, type PaySchedule } from './paydays';
import { occurrences } from './recurrence';
import {
  dueCommitments,
  safeToSpend,
  type Commitment,
  type RecurringItem,
  type SafeToSpend,
} from './safeToSpend';

/**
 * A figure the user typed, and when: the current account balance or what's in a pot.
 * Everything since is worked out from pay, bills and spends until they set it again.
 */
export interface Anchor {
  amount: Pence;
  /** The day it was set. */
  date: IsoDate;
  /** The moment it was set (ms), to tell spends and ticks before it from those after. */
  at: number;
}

/** A bill or pot payment, with the occurrences the user has ticked off as paid. */
export interface BudgetItem extends RecurringItem {
  /** Occurrence date → the moment it was ticked off (ms). */
  paid: Readonly<Record<IsoDate, number>>;
}

export interface SpendEntry {
  id: string;
  label: string;
  amount: Pence;
  date: IsoDate;
  /** The moment it was logged (ms). */
  at: number;
}

export interface PayPlan {
  schedule: PaySchedule;
  /** Take-home pay each payday. */
  amount: Pence;
}

export interface BudgetInput {
  today: IsoDate;
  holidays: BankHolidays;
  pay: PayPlan;
  balance: Anchor;
  items: readonly BudgetItem[];
  spends: readonly SpendEntry[];
  buffer: Pence;
  overdraft: { include: boolean; limit: Pence };
}

export interface TodayView {
  /** What should be in the current account now. */
  balance: Pence;
  nextPayday: Payday;
  daysUntilPayday: number;
  /** Today's share of what's left until payday, set at the start of the day. */
  allowance: Pence;
  spentToday: Pence;
  /** allowance − spentToday. Negative when overspent. */
  leftToday: Pence;
  /** The breakdown behind the allowance, for "How is this worked out?". */
  safe: SafeToSpend;
  /** Unpaid bills and pot payments from today to payday. */
  upcoming: Commitment[];
}

/** True if `date` is one of the item's own dates. */
function isOccurrence(item: BudgetItem, date: IsoDate): boolean {
  return occurrences(item.rule, date, date).length > 0;
}

/**
 * What has left the account for this item since the anchor was set:
 *  - occurrences from the anchor's day up to yesterday, unless ticked off before the anchor
 *    (the typed figure already allowed for them)
 *  - occurrences from today on that were ticked off after the anchor
 */
export function outgoingsSince(item: BudgetItem, anchor: Anchor, today: IsoDate): Pence {
  const past = today > anchor.date ? occurrences(item.rule, anchor.date, addDays(today, -1)) : [];
  const gone = past.filter((date) => {
    const paidAt = item.paid[date];
    return paidAt === undefined || paidAt > anchor.at;
  }).length;
  const ahead = Object.entries(item.paid).filter(
    ([date, at]) =>
      date >= today && date >= anchor.date && at > anchor.at && isOccurrence(item, date),
  ).length;
  return (gone + ahead) * item.amount;
}

function spentSince(spends: readonly SpendEntry[], anchor: Anchor): Pence {
  return sumPence(spends.filter((s) => s.at > anchor.at).map((s) => s.amount));
}

/** What should be in the current account today, from the last balance the user typed. */
export function projectBalance(input: BudgetInput): Pence {
  const { balance, today } = input;
  const paydays =
    today > balance.date
      ? paydaysBetween(input.pay.schedule, input.holidays, addDays(balance.date, 1), today).length
      : 0;
  const outgoings = sumPence(input.items.map((item) => outgoingsSince(item, balance, today)));
  return (
    balance.amount + paydays * input.pay.amount - outgoings - spentSince(input.spends, balance)
  );
}

/** Every ticked-off occurrence, as commitment keys. */
export function paidKeys(items: readonly BudgetItem[]): Set<string> {
  return new Set(items.flatMap((item) => Object.keys(item.paid).map((d) => `${item.id}:${d}`)));
}

/** The Today screen: safe to spend today, days to payday and what's coming out. */
export function budgetToday(input: BudgetInput): TodayView {
  const { today } = input;
  const balance = projectBalance(input);
  const spentToday = sumPence(
    input.spends.filter((s) => s.date === today && s.at > input.balance.at).map((s) => s.amount),
  );
  const payday = nextPayday(input.pay.schedule, input.holidays, today);
  const upcoming = dueCommitments(input.items, today, payday.date, paidKeys(input.items));
  // The allowance is set from the balance at the start of the day, so spending today
  // lowers what's left today rather than the allowance itself.
  const safe = safeToSpend({
    today,
    nextPayday: payday.date,
    balance: balance + spentToday,
    commitments: upcoming,
    buffer: input.buffer,
    overdraft: input.overdraft,
  });
  return {
    balance,
    nextPayday: payday,
    daysUntilPayday: safe.daysUntilPayday,
    allowance: safe.safeToday,
    spentToday,
    leftToday: safe.safeToday - spentToday,
    safe,
    upcoming,
  };
}

/** What's in a pot now: the figure last typed plus each saving since. */
export function potSaved(saved: Anchor, pot: BudgetItem, today: IsoDate): Pence {
  return saved.amount + outgoingsSince(pot, saved, today);
}

/** The next `count` unpaid bills from today, however far off. */
export function nextBills(
  items: readonly BudgetItem[],
  today: IsoDate,
  count: number,
): Commitment[] {
  const bills = items.filter((item) => item.kind === 'bill');
  return dueCommitments(bills, today, addDays(today, 400), paidKeys(bills)).slice(0, count);
}

/** Occurrences from today to payday that have been ticked off, to show as done. */
export function paidUntil(
  items: readonly BudgetItem[],
  today: IsoDate,
  payday: IsoDate,
): Commitment[] {
  return items
    .flatMap((item) =>
      Object.keys(item.paid)
        .filter((date) => date >= today && date <= payday && isOccurrence(item, date))
        .map((date) => ({
          key: `${item.id}:${date}`,
          label: item.label,
          kind: item.kind,
          date,
          amount: item.amount,
        })),
    )
    .sort((a, b) => compareIso(a.date, b.date));
}
