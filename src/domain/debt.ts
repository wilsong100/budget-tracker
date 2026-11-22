import { addMonths, monthKey, type MonthKey } from './dates';
import { assertNonNegativePence, mulDivRound, type Pence } from './money';

export interface Debt {
  id: string;
  name: string;
  balance: Pence;
  /** APR in basis points: 24.9% is 2490. */
  aprBasisPoints: number;
  /** A fixed monthly minimum payment. */
  minimumPayment: Pence;
}

export type Strategy = 'snowball' | 'avalanche' | 'custom';

export interface DebtMonth {
  /** 1 is the first month of the plan. */
  month: number;
  interest: Record<string, Pence>;
  payments: Record<string, Pence>;
  /** Balances at the end of the month. */
  balances: Record<string, Pence>;
}

export interface DebtPlan {
  status: 'ok' | 'budgetBelowMinimums' | 'neverPaysOff';
  months: number;
  totalInterest: Pence;
  totalPaid: Pence;
  /** The plan month each debt is cleared in (0 if it was already clear). */
  payoffMonth: Record<string, number>;
  /** The month the last debt is cleared, when a start month is given. */
  debtFreeMonth: MonthKey | null;
  schedule: DebtMonth[];
}

/** After 50 years, a plan isn't going to finish. */
const MAX_MONTHS = 600;

// Ids are unique (checked in validate), so two debts never compare equal here.
const byId = (a: Debt, b: Debt) => (a.id < b.id ? -1 : 1);

/**
 * The order extra money goes to debts.
 * Snowball: smallest balance first (then highest rate). Avalanche: highest rate first
 * (then smallest balance). Custom: the order the user chose. Ties go by id.
 */
export function payoffOrder(
  debts: readonly Debt[],
  strategy: Strategy,
  order?: readonly string[],
): string[] {
  if (strategy === 'custom') {
    const ids = new Set(debts.map((d) => d.id));
    if (
      !order ||
      order.length !== ids.size ||
      new Set(order).size !== order.length ||
      !order.every((id) => ids.has(id))
    ) {
      throw new RangeError('own order must list every debt exactly once');
    }
    return [...order];
  }
  const sorted = [...debts].sort((a, b) => {
    const balance = a.balance - b.balance;
    const rate = b.aprBasisPoints - a.aprBasisPoints;
    const primary = strategy === 'snowball' ? balance || rate : rate || balance;
    return primary || byId(a, b);
  });
  return sorted.map((d) => d.id);
}

function validate(debts: readonly Debt[], budget: Pence): void {
  assertNonNegativePence(budget, 'monthly budget');
  const ids = new Set<string>();
  for (const debt of debts) {
    assertNonNegativePence(debt.balance, `balance of ${debt.name}`);
    assertNonNegativePence(debt.aprBasisPoints, `APR of ${debt.name}`);
    assertNonNegativePence(debt.minimumPayment, `minimum payment of ${debt.name}`);
    if (ids.has(debt.id)) throw new RangeError(`two debts share the id ${debt.id}`);
    ids.add(debt.id);
  }
}

/**
 * Pays off debts month by month with a fixed monthly budget. Each month interest is added,
 * every debt gets its minimum, and the rest goes to debts in payoff order. When a debt is
 * cleared, its money rolls on to the next debt in the same month.
 */
export function planDebts(
  debts: readonly Debt[],
  monthlyBudget: Pence,
  strategy: Strategy,
  options: { order?: readonly string[]; startMonth?: MonthKey } = {},
): DebtPlan {
  validate(debts, monthlyBudget);
  const order = payoffOrder(debts, strategy, options.order);
  const balances = new Map(debts.map((d) => [d.id, d.balance]));
  const debtsById = new Map(debts.map((d) => [d.id, d]));
  const payoffMonth: Record<string, number> = {};
  for (const debt of debts) if (debt.balance === 0) payoffMonth[debt.id] = 0;

  const plan = (status: DebtPlan['status'], schedule: DebtMonth[]): DebtPlan => {
    const sum = (field: 'interest' | 'payments') =>
      schedule.reduce((total, m) => total + Object.values(m[field]).reduce((a, b) => a + b, 0), 0);
    const months = status === 'ok' ? schedule.length : 0;
    return {
      status,
      months,
      totalInterest: sum('interest'),
      totalPaid: sum('payments'),
      payoffMonth,
      debtFreeMonth:
        status === 'ok' && options.startMonth
          ? monthKey(addMonths(`${options.startMonth}-01`, Math.max(0, months - 1)))
          : null,
      schedule,
    };
  };

  const active = () => order.filter((id) => balances.get(id)! > 0);
  const minimums = active().reduce((total, id) => total + debtsById.get(id)!.minimumPayment, 0);
  if (minimums > monthlyBudget) return plan('budgetBelowMinimums', []);

  const schedule: DebtMonth[] = [];
  while (active().length > 0) {
    if (schedule.length === MAX_MONTHS) return plan('neverPaysOff', schedule);
    const month: DebtMonth = {
      month: schedule.length + 1,
      interest: {},
      payments: {},
      balances: {},
    };
    const ids = active();
    for (const id of ids) {
      const interest = mulDivRound(balances.get(id)!, debtsById.get(id)!.aprBasisPoints, 120_000);
      month.interest[id] = interest;
      balances.set(id, balances.get(id)! + interest);
    }
    let available = monthlyBudget;
    const pay = (id: string, wanted: Pence) => {
      const amount = Math.min(wanted, balances.get(id)!, available);
      month.payments[id] = (month.payments[id] ?? 0) + amount;
      balances.set(id, balances.get(id)! - amount);
      available -= amount;
    };
    for (const id of ids) pay(id, debtsById.get(id)!.minimumPayment);
    for (const id of ids) pay(id, available);
    for (const id of ids) {
      month.balances[id] = balances.get(id)!;
      if (balances.get(id) === 0) payoffMonth[id] = month.month;
    }
    schedule.push(month);
  }
  return plan('ok', schedule);
}

/**
 * Interest saved by paying the monthly budget instead of only the minimums.
 * Null if either plan never finishes.
 */
export function interestSaved(
  debts: readonly Debt[],
  monthlyBudget: Pence,
  strategy: Strategy,
  options: { order?: readonly string[] } = {},
): Pence | null {
  const minimumOnly = planDebts(
    debts,
    debts.reduce((total, d) => total + d.minimumPayment, 0),
    strategy,
    options,
  );
  const withBudget = planDebts(debts, monthlyBudget, strategy, options);
  if (minimumOnly.status !== 'ok' || withBudget.status !== 'ok') return null;
  return minimumOnly.totalInterest - withBudget.totalInterest;
}
