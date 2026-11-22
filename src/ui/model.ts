// What each stored record holds, and how a set of records becomes the inputs the domain
// layer works on. Records that don't read cleanly are skipped, never fatal: a bad record from
// an old backup or another device mustn't stop the app opening.
import {
  bundledBankHolidays,
  isIsoDate,
  isPence,
  REGIONS,
  type Anchor,
  type BudgetInput,
  type Debt,
  type Strategy,
  type BudgetItem,
  type IsoDate,
  type PayCycle,
  type Pence,
  type Recurrence,
  type Region,
} from '../domain';
import type { Json, StoredRecord } from '../storage';

/** Fixed ids for the records there's only one of, so two devices update the same record. */
export const IDS = {
  pay: 'pay',
  balance: 'balance',
  prefs: 'prefs',
  debtPlan: 'debtPlan',
} as const;

export type Mode = 'simple' | 'advanced';
export type Theme = 'system' | 'light' | 'dark';
export type PaymentMethod = 'directDebit' | 'standingOrder' | 'card' | 'other';

export interface PayData {
  cycle: PayCycle;
  overrides: Record<IsoDate, IsoDate>;
  amount: Pence;
  region: Region;
}

export interface PrefsData {
  mode: Mode;
  theme: Theme;
  buffer: Pence;
  overdraft: { include: boolean; limit: Pence };
  /** True while the sample household is loaded. */
  example: boolean;
}

export interface BillData {
  label: string;
  amount: Pence;
  rule: Recurrence;
  method: PaymentMethod;
  paid: Record<IsoDate, number>;
}

export interface PotData {
  label: string;
  target: Pence | null;
  targetDate: IsoDate | null;
  saved: Anchor;
  /** Saved each time the rule comes round; 0 for a pot topped up by hand. */
  amount: Pence;
  rule: Recurrence | null;
  paid: Record<IsoDate, number>;
}

export interface SpendData {
  label: string;
  amount: Pence;
  date: IsoDate;
  at: number;
  category: string | null;
}

export interface CategoryData {
  name: string;
  /** What the user plans to spend in this category each month, for Month review. */
  planned: Pence | null;
}

/** A credit card, loan or pay-later plan, for the Debt screen. */
export interface DebtData {
  name: string;
  balance: Pence;
  /** 24.9% APR is 2490. */
  aprBasisPoints: number;
  minimumPayment: Pence;
}

export interface DebtPlanData {
  strategy: Strategy;
  /** Paid towards all debts each month. */
  monthly: Pence;
  /** Debt ids, for the user's own order. */
  order: string[];
}

export const DEFAULT_DEBT_PLAN: DebtPlanData = { strategy: 'avalanche', monthly: 0, order: [] };

export const DEFAULT_PREFS: PrefsData = {
  mode: 'simple',
  theme: 'system',
  buffer: 0,
  overdraft: { include: false, limit: 0 },
  example: false,
};

export interface Row<T> {
  id: string;
  data: T;
}

export interface Budget {
  pay: PayData | null;
  balance: Anchor | null;
  prefs: PrefsData;
  bills: Row<BillData>[];
  pots: Row<PotData>[];
  spends: Row<SpendData>[];
  categories: Row<CategoryData>[];
  debts: Row<DebtData>[];
  debtPlan: DebtPlanData;
}

/** Our data types are plain JSON; this tells TypeScript so. */
export function toJson<T>(data: T): Json {
  return data as unknown as Json;
}

// ---- reading records ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string';
const isDay = (v: unknown): v is number | 'last' =>
  v === 'last' || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31);
const isTime = (v: unknown): v is number => Number.isFinite(v);

function isRule(v: unknown): v is Recurrence {
  if (!isObj(v)) return false;
  if (v['start'] !== undefined && !isIsoDate(v['start'])) return false;
  if (v['end'] !== undefined && !isIsoDate(v['end'])) return false;
  switch (v['kind']) {
    case 'once':
      return isIsoDate(v['date']);
    case 'everyNWeeks':
      return [1, 2, 4].includes(v['weeks'] as number) && isIsoDate(v['anchor']);
    case 'everyNMonths':
      return (
        [1, 3, 6, 12].includes(v['months'] as number) && isDay(v['day']) && isIsoDate(v['anchor'])
      );
    case 'councilTax':
      return (v['instalments'] === 10 || v['instalments'] === 12) && isDay(v['day']);
    default:
      return false;
  }
}

function isCycle(v: unknown): v is PayCycle {
  if (!isObj(v)) return false;
  switch (v['kind']) {
    case 'monthly':
      return Number.isInteger(v['day']) && (v['day'] as number) >= 1 && (v['day'] as number) <= 31;
    case 'lastWorkingDay':
      return true;
    case 'fourWeekly':
    case 'fortnightly':
    case 'weekly':
      return isIsoDate(v['anchor']);
    default:
      return false;
  }
}

function isAnchor(v: unknown): v is Anchor {
  return isObj(v) && isPence(v['amount']) && isIsoDate(v['date']) && isTime(v['at']);
}

function isDateMap(v: unknown, values: (x: unknown) => boolean): v is Record<IsoDate, never> {
  return isObj(v) && Object.entries(v).every(([k, x]) => isIsoDate(k) && values(x));
}

function readPay(v: unknown): PayData | null {
  if (!isObj(v) || !isCycle(v['cycle']) || !isPence(v['amount'])) return null;
  const region = REGIONS.includes(v['region'] as Region)
    ? (v['region'] as Region)
    : 'england-and-wales';
  const overrides = isDateMap(v['overrides'], isIsoDate) ? v['overrides'] : {};
  return { cycle: v['cycle'], amount: v['amount'], region, overrides };
}

function readPrefs(v: unknown): PrefsData {
  if (!isObj(v)) return DEFAULT_PREFS;
  const overdraft = isObj(v['overdraft']) ? v['overdraft'] : {};
  return {
    mode: v['mode'] === 'advanced' ? 'advanced' : 'simple',
    theme: v['theme'] === 'light' || v['theme'] === 'dark' ? v['theme'] : 'system',
    buffer: isPence(v['buffer']) && v['buffer'] >= 0 ? v['buffer'] : 0,
    overdraft: {
      include: overdraft['include'] === true,
      limit: isPence(overdraft['limit']) && overdraft['limit'] >= 0 ? overdraft['limit'] : 0,
    },
    example: v['example'] === true,
  };
}

function readBill(v: unknown): BillData | null {
  if (!isObj(v) || !isText(v['label']) || !isPence(v['amount']) || v['amount'] < 0) return null;
  if (!isRule(v['rule'])) return null;
  const methods: PaymentMethod[] = ['directDebit', 'standingOrder', 'card', 'other'];
  return {
    label: v['label'],
    amount: v['amount'],
    rule: v['rule'],
    method: methods.includes(v['method'] as PaymentMethod)
      ? (v['method'] as PaymentMethod)
      : 'other',
    paid: isDateMap(v['paid'], isTime) ? v['paid'] : {},
  };
}

function readPot(v: unknown): PotData | null {
  if (!isObj(v) || !isText(v['label']) || !isAnchor(v['saved'])) return null;
  const amount = isPence(v['amount']) && v['amount'] >= 0 ? v['amount'] : 0;
  return {
    label: v['label'],
    target: isPence(v['target']) && v['target'] > 0 ? v['target'] : null,
    targetDate: isIsoDate(v['targetDate']) ? v['targetDate'] : null,
    saved: v['saved'],
    amount,
    rule: isRule(v['rule']) ? v['rule'] : null,
    paid: isDateMap(v['paid'], isTime) ? v['paid'] : {},
  };
}

function readSpend(v: unknown): SpendData | null {
  if (!isObj(v) || !isText(v['label']) || !isPence(v['amount']) || v['amount'] <= 0) return null;
  if (!isIsoDate(v['date']) || !isTime(v['at'])) return null;
  return {
    label: v['label'],
    amount: v['amount'],
    date: v['date'],
    at: v['at'],
    category: isText(v['category']) ? v['category'] : null,
  };
}

function readCategory(v: unknown): CategoryData | null {
  if (!isObj(v) || !isText(v['name']) || v['name'].trim() === '') return null;
  const planned = isPence(v['planned']) && v['planned'] >= 0 ? v['planned'] : null;
  return { name: v['name'], planned };
}

const isNonNegative = (v: unknown): v is Pence => isPence(v) && v >= 0;

function readDebt(v: unknown): DebtData | null {
  if (!isObj(v) || !isText(v['name']) || v['name'].trim() === '') return null;
  const { balance, aprBasisPoints, minimumPayment } = v;
  if (!isNonNegative(balance) || !isNonNegative(aprBasisPoints)) return null;
  if (!isNonNegative(minimumPayment)) return null;
  return { name: v['name'], balance, aprBasisPoints, minimumPayment };
}

function readDebtPlan(v: unknown): DebtPlanData {
  if (!isObj(v)) return DEFAULT_DEBT_PLAN;
  const strategies: Strategy[] = ['snowball', 'avalanche', 'custom'];
  const order = v['order'];
  return {
    strategy: strategies.includes(v['strategy'] as Strategy)
      ? (v['strategy'] as Strategy)
      : DEFAULT_DEBT_PLAN.strategy,
    monthly: isNonNegative(v['monthly']) ? v['monthly'] : 0,
    order: Array.isArray(order) && order.every(isText) ? order : [],
  };
}

function rows<T>(records: StoredRecord[], read: (v: unknown) => T | null): Row<T>[] {
  return records.flatMap((r) => {
    const data = read(r.data);
    return data === null ? [] : [{ id: r.id, data }];
  });
}

/** Turns stored records (live ones, not tombstones) into the budget the screens show. */
export function readBudget(records: readonly StoredRecord[]): Budget {
  const live = records.filter((r) => r.deleted === 0);
  const byType = (type: StoredRecord['type']) => live.filter((r) => r.type === type);
  const setting = (id: string) => live.find((r) => r.type === 'setting' && r.id === id)?.data;
  const payRecord = byType('payRule').find((r) => r.id === IDS.pay);
  const balance = setting(IDS.balance);
  return {
    pay: payRecord ? readPay(payRecord.data) : null,
    balance: isAnchor(balance) ? balance : null,
    prefs: readPrefs(setting(IDS.prefs)),
    bills: rows(byType('bill'), readBill),
    pots: rows(byType('pot'), readPot),
    spends: rows(byType('spend'), readSpend).sort((a, b) => b.data.at - a.data.at),
    categories: rows(byType('category'), readCategory),
    debts: rows(byType('debt'), readDebt),
    debtPlan: readDebtPlan(setting(IDS.debtPlan)),
  };
}

/** Set up means there's a pay rule and a balance to work from. */
export function isSetUp(budget: Budget): budget is Budget & { pay: PayData; balance: Anchor } {
  return budget.pay !== null && budget.balance !== null;
}

export function billItem(row: Row<BillData>): BudgetItem {
  const { label, amount, rule, paid } = row.data;
  return { id: row.id, label, kind: 'bill', amount, rule, paid };
}

/** A pot is a commitment only when it has a regular saving. */
export function potItem(row: Row<PotData>): BudgetItem | null {
  const { label, amount, rule, paid } = row.data;
  if (!rule || amount <= 0) return null;
  return { id: row.id, label, kind: 'pot', amount, rule, paid };
}

/** The domain layer's input for a budget that's set up. */
export function budgetInput(
  budget: Budget & { pay: PayData; balance: Anchor },
  today: IsoDate,
): BudgetInput {
  const { pay, prefs } = budget;
  return {
    today,
    holidays: bundledBankHolidays(pay.region),
    pay: { schedule: { cycle: pay.cycle, overrides: pay.overrides }, amount: pay.amount },
    balance: budget.balance,
    items: [...budget.bills.map(billItem), ...budget.pots.flatMap((p) => potItem(p) ?? [])],
    spends: budget.spends.map(({ id, data }) => ({ id, ...data })),
    buffer: prefs.buffer,
    overdraft: prefs.overdraft,
  };
}

/** Finds the item an upcoming commitment belongs to (keys are `${id}:${date}`). */
export function splitKey(key: string): { id: string; date: IsoDate } {
  const at = key.lastIndexOf(':');
  return { id: key.slice(0, at), date: key.slice(at + 1) };
}

/** The domain layer's debts. */
export function debtsOf(budget: Budget): Debt[] {
  return budget.debts.map(({ id, data }) => ({ id, ...data }));
}

/**
 * The user's own order, kept valid: debts since deleted drop out, repeats are ignored, and
 * debts added since join the end.
 */
export function ownOrder(ids: readonly string[], order: readonly string[]): string[] {
  const live = new Set(ids);
  const kept = [...new Set(order)].filter((id) => live.has(id));
  return [...kept, ...ids.filter((id) => !kept.includes(id))];
}
