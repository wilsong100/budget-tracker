import { describe, expect, it } from 'vitest';
import type { StoredRecord } from '../storage';
import {
  budgetInput,
  DEFAULT_DEBT_PLAN,
  debtsOf,
  isSetUp,
  ownOrder,
  potItem,
  readBudget,
  splitKey,
} from './model';

let n = 0;
const rec = (type: StoredRecord['type'], data: unknown, id = `id-${n++}`, deleted: 0 | 1 = 0) =>
  ({ id, type, data, hlc: '0', deleted, device_id: 'd' }) as StoredRecord;

const pay = rec('payRule', { cycle: { kind: 'monthly', day: 28 }, amount: 200000 }, 'pay');
const balance = rec('setting', { amount: 123456, date: '2026-11-21', at: 1 }, 'balance');

describe('readBudget', () => {
  it('reads a set-up budget, filling in defaults', () => {
    const budget = readBudget([pay, balance]);
    expect(isSetUp(budget)).toBe(true);
    expect(budget.pay?.region).toBe('england-and-wales');
    expect(budget.pay?.overrides).toEqual({});
    expect(budget.prefs).toEqual({
      mode: 'simple',
      theme: 'system',
      buffer: 0,
      overdraft: { include: false, limit: 0 },
      example: false,
    });
  });

  it('is not set up without pay or a balance', () => {
    expect(isSetUp(readBudget([pay]))).toBe(false);
    expect(isSetUp(readBudget([balance]))).toBe(false);
  });

  it('skips records that don’t read cleanly instead of failing', () => {
    const budget = readBudget([
      pay,
      balance,
      rec('bill', {
        label: 'Rent',
        amount: 79500,
        rule: { kind: 'councilTax', instalments: 10, day: 1 },
      }),
      rec('bill', {
        label: 'Bad rule',
        amount: 100,
        rule: { kind: 'everyNMonths', months: 2, day: 1, anchor: '2026-01-01' },
      }),
      rec('bill', { label: 'Float', amount: 1.5, rule: { kind: 'once', date: '2026-12-01' } }),
      rec('bill', 'not an object'),
      rec('spend', {
        label: 'coffee',
        amount: 340,
        date: '2026-11-21',
        at: 5,
        category: 'eating-out',
      }),
      rec('spend', { label: 'zero', amount: 0, date: '2026-11-21', at: 6 }),
      rec('spend', { label: 'bad date', amount: 100, date: '21/11/2026', at: 7 }),
      rec('category', { name: '  ' }),
      rec('category', { name: 'Fun' }),
      rec('pot', { label: 'No anchor', amount: 100 }),
    ]);
    expect(budget.bills.map((b) => b.data.label)).toEqual(['Rent']);
    expect(budget.bills[0]?.data.method).toBe('other');
    expect(budget.spends.map((s) => s.data.label)).toEqual(['coffee']);
    expect(budget.categories.map((c) => c.data.name)).toEqual(['Fun']);
    expect(budget.pots).toEqual([]);
  });

  it('leaves out deleted records and sorts spends newest first', () => {
    const budget = readBudget([
      rec('spend', { label: 'old', amount: 100, date: '2026-11-20', at: 1 }),
      rec('spend', { label: 'new', amount: 100, date: '2026-11-21', at: 9 }),
      rec('spend', { label: 'gone', amount: 100, date: '2026-11-21', at: 5 }, 'x', 1),
    ]);
    expect(budget.spends.map((s) => s.data.label)).toEqual(['new', 'old']);
  });

  it('ignores unknown prefs and bad pay regions', () => {
    const budget = readBudget([
      rec('payRule', { cycle: { kind: 'weekly', anchor: 'nope' }, amount: 100 }, 'pay'),
      rec(
        'setting',
        { mode: 'expert', theme: 'neon', buffer: -5, overdraft: { include: 'yes' } },
        'prefs',
      ),
    ]);
    expect(budget.pay).toBeNull();
    expect(budget.prefs.mode).toBe('simple');
    expect(budget.prefs.theme).toBe('system');
    expect(budget.prefs.buffer).toBe(0);
    expect(budget.prefs.overdraft.include).toBe(false);
  });
});

describe('budgetInput', () => {
  it('counts pots only when they have a regular saving', () => {
    const saved = { amount: 0, date: '2026-11-21', at: 1 };
    const budget = readBudget([
      pay,
      balance,
      rec('pot', { label: 'By hand', saved, amount: 0, rule: null }),
      rec('pot', {
        label: 'Monthly',
        saved,
        amount: 2500,
        rule: { kind: 'everyNMonths', months: 1, day: 28, anchor: '2026-11-21' },
      }),
    ]);
    expect(budget.pots.map(potItem).map((p) => p?.label ?? null)).toEqual([null, 'Monthly']);
    if (!isSetUp(budget)) throw new Error('expected a set-up budget');
    expect(budgetInput(budget, '2026-11-21').items.map((i) => i.label)).toEqual(['Monthly']);
  });
});

describe('splitKey', () => {
  it('splits on the last colon', () => {
    expect(splitKey('a:b:2026-11-21')).toEqual({ id: 'a:b', date: '2026-11-21' });
  });
});

describe('debts', () => {
  it('reads debts, skipping ones that don’t read cleanly', () => {
    const budget = readBudget([
      rec(
        'debt',
        { name: 'Card', balance: 120000, aprBasisPoints: 2490, minimumPayment: 3600 },
        'c',
      ),
      rec(
        'debt',
        { name: 'Loan', balance: 500000, aprBasisPoints: 690, minimumPayment: 15000 },
        'l',
      ),
      rec('debt', { name: 'Float', balance: 1.5, aprBasisPoints: 0, minimumPayment: 0 }),
      rec('debt', { name: 'Negative', balance: -100, aprBasisPoints: 0, minimumPayment: 0 }),
      rec('debt', { name: 'Bad APR', balance: 100, aprBasisPoints: 24.9, minimumPayment: 0 }),
      rec('debt', { name: '', balance: 100, aprBasisPoints: 0, minimumPayment: 0 }),
    ]);
    expect(budget.debts.map((d) => d.data.name)).toEqual(['Card', 'Loan']);
    expect(debtsOf(budget)).toEqual([
      { id: 'c', name: 'Card', balance: 120000, aprBasisPoints: 2490, minimumPayment: 3600 },
      { id: 'l', name: 'Loan', balance: 500000, aprBasisPoints: 690, minimumPayment: 15000 },
    ]);
  });

  it('reads the debt plan, falling back to defaults', () => {
    expect(readBudget([]).debtPlan).toEqual(DEFAULT_DEBT_PLAN);
    const plan = rec(
      'setting',
      { strategy: 'custom', monthly: 30000, order: ['l', 'c'] },
      'debtPlan',
    );
    expect(readBudget([plan]).debtPlan).toEqual({
      strategy: 'custom',
      monthly: 30000,
      order: ['l', 'c'],
    });
    const bad = rec('setting', { strategy: 'yolo', monthly: -1, order: 'c' }, 'debtPlan');
    expect(readBudget([bad]).debtPlan).toEqual(DEFAULT_DEBT_PLAN);
  });

  it('keeps the user’s own order valid as debts come and go', () => {
    // Removed debts drop out; new ones join the end, in the order they were added.
    expect(ownOrder(['a', 'b', 'c'], ['c', 'gone', 'a', 'c'])).toEqual(['c', 'a', 'b']);
    expect(ownOrder([], ['a'])).toEqual([]);
  });
});

describe('category plans', () => {
  it('reads a planned monthly amount, or none', () => {
    const budget = readBudget([
      rec('category', { name: 'Groceries', planned: 30000 }, 'g'),
      rec('category', { name: 'Fun' }, 'f'),
      rec('category', { name: 'Odd', planned: -5 }, 'o'),
    ]);
    expect(budget.categories.map((c) => c.data)).toEqual([
      { name: 'Groceries', planned: 30000 },
      { name: 'Fun', planned: null },
      { name: 'Odd', planned: null },
    ]);
  });
});
