// "Try with example numbers": a sample household, wiped in one tap (docs/PLAN.md,
// Differentiator 2). Every figure is made up and labelled as an example on screen.
import { addDays, DEFAULT_CATEGORIES, type IsoDate } from '../domain';
import type { Change } from '../storage';
import {
  DEFAULT_PREFS,
  IDS,
  toJson,
  type BillData,
  type DebtData,
  type DebtPlanData,
  type PayData,
  type PotData,
  type SpendData,
} from './model';

export function exampleHousehold(today: IsoDate, now: number): Change[] {
  const monthly = (day: number) =>
    ({ kind: 'everyNMonths', months: 1, day, anchor: today }) as const;
  const pay: PayData = {
    cycle: { kind: 'lastWorkingDay' },
    overrides: {},
    amount: 215000,
    region: 'england-and-wales',
  };
  const bills: BillData[] = [
    { label: 'Rent', amount: 79500, rule: monthly(1), method: 'standingOrder', paid: {} },
    {
      label: 'Council tax',
      amount: 14200,
      rule: { kind: 'councilTax', instalments: 10, day: 1 },
      method: 'directDebit',
      paid: {},
    },
    { label: 'Energy', amount: 8800, rule: monthly(15), method: 'directDebit', paid: {} },
    { label: 'Mobile', amount: 1800, rule: monthly(22), method: 'directDebit', paid: {} },
    { label: 'Broadband', amount: 3200, rule: monthly(26), method: 'directDebit', paid: {} },
    { label: 'Streaming', amount: 1099, rule: monthly(3), method: 'card', paid: {} },
  ];
  const pots: PotData[] = [
    {
      label: 'Christmas',
      target: 40000,
      targetDate: `${today.slice(0, 4)}-12-15` > today ? `${today.slice(0, 4)}-12-15` : null,
      saved: { amount: 18000, date: today, at: now },
      amount: 0,
      rule: null,
      paid: {},
    },
    {
      label: 'Car tax and MOT',
      target: 32000,
      targetDate: addDays(today, 240),
      saved: { amount: 6000, date: today, at: now },
      amount: 3500,
      rule: monthly(2),
      paid: {},
    },
  ];
  const spends: SpendData[] = [
    {
      label: 'Tesco',
      amount: 2340,
      date: addDays(today, -1),
      at: now - 86_400_000,
      category: 'groceries',
    },
    {
      label: 'Bus',
      amount: 280,
      date: addDays(today, -1),
      at: now - 80_000_000,
      category: 'transport',
    },
    {
      label: 'Coffee',
      amount: 340,
      date: addDays(today, -2),
      at: now - 170_000_000,
      category: 'eating-out',
    },
  ];
  const debts: DebtData[] = [
    { name: 'Credit card', balance: 185000, aprBasisPoints: 2290, minimumPayment: 5500 },
    { name: 'Car loan', balance: 420000, aprBasisPoints: 890, minimumPayment: 18000 },
  ];
  const debtPlan: DebtPlanData = { strategy: 'avalanche', monthly: 30000, order: [] };
  /** Monthly plans for Month review. */
  const planned: Record<string, number> = { groceries: 32000, 'eating-out': 8000, transport: 6000 };
  return [
    { type: 'payRule', id: IDS.pay, data: toJson(pay) },
    // Spends above are dated before the balance was set, so they're history, not taken off.
    { type: 'setting', id: IDS.balance, data: { amount: 64000, date: today, at: now } },
    { type: 'setting', id: IDS.prefs, data: toJson({ ...DEFAULT_PREFS, example: true }) },
    ...DEFAULT_CATEGORIES.map((c): Change => ({
      type: 'category',
      id: c.id,
      data: { name: c.name, planned: planned[c.id] ?? null },
    })),
    ...bills.map((b): Change => ({ type: 'bill', data: toJson(b) })),
    ...pots.map((p): Change => ({ type: 'pot', data: toJson(p) })),
    ...spends.map((s): Change => ({ type: 'spend', data: toJson(s) })),
    ...debts.map((d): Change => ({ type: 'debt', data: toJson(d) })),
    { type: 'setting', id: IDS.debtPlan, data: toJson(debtPlan) },
  ];
}
