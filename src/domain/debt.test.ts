import { describe, expect, it } from 'vitest';
import { interestSaved, payoffOrder, planDebts, type Debt } from './debt';

const zeroA: Debt = {
  id: 'A',
  name: 'Card A',
  balance: 500,
  aprBasisPoints: 0,
  minimumPayment: 100,
};
const zeroB: Debt = {
  id: 'B',
  name: 'Card B',
  balance: 1000,
  aprBasisPoints: 0,
  minimumPayment: 100,
};

describe('planDebts', () => {
  it('pays a single interest-free debt', () => {
    const plan = planDebts([{ ...zeroA, balance: 1000, minimumPayment: 300 }], 300, 'snowball');
    expect(plan).toMatchObject({ status: 'ok', months: 4, totalInterest: 0, totalPaid: 1000 });
    expect(plan.schedule.map((month) => month.payments['A'])).toEqual([300, 300, 300, 100]);
  });

  it('adds monthly interest before payments (worked by hand)', () => {
    // 12% APR is 1% a month. £100 → +£1.00 −£50 = £51 → +51p −£50 = £1.51 → +2p −£1.53 = 0.
    const plan = planDebts(
      [{ id: 'L', name: 'Loan', balance: 10000, aprBasisPoints: 1200, minimumPayment: 1000 }],
      5000,
      'avalanche',
    );
    expect(plan).toMatchObject({ status: 'ok', months: 3, totalInterest: 153, totalPaid: 10153 });
    expect(plan.schedule.map((month) => month.interest['L'])).toEqual([100, 51, 2]);
    expect(plan.schedule.map((month) => month.balances['L'])).toEqual([5100, 151, 0]);
  });

  it('rolls a cleared debt’s payment on to the next, in the same month', () => {
    const plan = planDebts([zeroA, zeroB], 400, 'snowball');
    expect(plan.months).toBe(4);
    expect(
      plan.schedule.map((month) => [month.payments['A'] ?? 0, month.payments['B'] ?? 0]),
    ).toEqual([
      [300, 100],
      [200, 200],
      [0, 400],
      [0, 300],
    ]);
    expect(plan.payoffMonth).toEqual({ A: 2, B: 4 });
    expect(plan.totalPaid).toBe(1500);
  });

  it('gives the debt-free month from a start month', () => {
    const plan = planDebts([zeroA, zeroB], 400, 'snowball', { startMonth: '2026-12' });
    expect(plan.debtFreeMonth).toBe('2027-03');
    expect(planDebts([zeroA, zeroB], 400, 'snowball').debtFreeMonth).toBeNull();
  });

  it('is done at once with no debts, or only cleared ones', () => {
    expect(planDebts([], 100, 'snowball')).toMatchObject({ status: 'ok', months: 0, totalPaid: 0 });
    expect(
      planDebts([{ ...zeroA, balance: 0 }], 100, 'snowball', { startMonth: '2026-12' }),
    ).toMatchObject({
      status: 'ok',
      months: 0,
      payoffMonth: { A: 0 },
      debtFreeMonth: '2026-12',
    });
  });

  it('says when the budget does not cover the minimum payments', () => {
    expect(planDebts([zeroA, zeroB], 150, 'snowball')).toMatchObject({
      status: 'budgetBelowMinimums',
      months: 0,
    });
  });

  it('says when payments never get ahead of the interest', () => {
    const plan = planDebts(
      [{ id: 'C', name: 'Card', balance: 100000, aprBasisPoints: 2400, minimumPayment: 1000 }],
      1500,
      'avalanche',
    );
    expect(plan.status).toBe('neverPaysOff');
  });

  it('pays less interest with avalanche, and clears a first debt sooner with snowball', () => {
    const debts: Debt[] = [
      {
        id: 'card',
        name: 'Credit card',
        balance: 100000,
        aprBasisPoints: 2490,
        minimumPayment: 2500,
      },
      { id: 'loan', name: 'Car loan', balance: 300000, aprBasisPoints: 990, minimumPayment: 5000 },
      {
        id: 'store',
        name: 'Store card',
        balance: 50000,
        aprBasisPoints: 1990,
        minimumPayment: 1500,
      },
    ];
    const snowball = planDebts(debts, 15000, 'snowball');
    const avalanche = planDebts(debts, 15000, 'avalanche');
    expect(snowball.status).toBe('ok');
    expect(avalanche.status).toBe('ok');
    expect(avalanche.totalInterest).toBeLessThan(snowball.totalInterest);
    expect(Math.min(...Object.values(snowball.payoffMonth))).toBeLessThan(
      Math.min(...Object.values(avalanche.payoffMonth)),
    );
    // Every month spends the whole budget until the final month.
    for (const month of snowball.schedule.slice(0, -1)) {
      expect(Object.values(month.payments).reduce((a, b) => a + b, 0)).toBe(15000);
    }
    expect(snowball.totalPaid - snowball.totalInterest).toBe(450000);
  });

  it('refuses bad debts', () => {
    expect(() => planDebts([{ ...zeroA, balance: -1 }], 100, 'snowball')).toThrow(RangeError);
    expect(() => planDebts([{ ...zeroA, aprBasisPoints: -1 }], 100, 'snowball')).toThrow(
      RangeError,
    );
    expect(() => planDebts([{ ...zeroA, minimumPayment: 1.5 }], 100, 'snowball')).toThrow(
      RangeError,
    );
    expect(() => planDebts([zeroA, zeroA], 300, 'snowball')).toThrow(RangeError);
    expect(() => planDebts([zeroA], -1, 'snowball')).toThrow(RangeError);
  });
});

describe('payoffOrder', () => {
  const debts: Debt[] = [
    { id: 'x', name: 'X', balance: 5000, aprBasisPoints: 1000, minimumPayment: 100 },
    { id: 'y', name: 'Y', balance: 5000, aprBasisPoints: 2000, minimumPayment: 100 },
    { id: 'z', name: 'Z', balance: 1000, aprBasisPoints: 2000, minimumPayment: 100 },
    { id: 'w', name: 'W', balance: 1000, aprBasisPoints: 2000, minimumPayment: 100 },
    { id: 'v', name: 'V', balance: 500, aprBasisPoints: 500, minimumPayment: 100 },
  ];

  it('snowball: smallest balance first, then highest rate, then id', () => {
    expect(payoffOrder(debts, 'snowball')).toEqual(['v', 'w', 'z', 'y', 'x']);
  });

  it('avalanche: highest rate first, then smallest balance, then id', () => {
    expect(payoffOrder(debts, 'avalanche')).toEqual(['w', 'z', 'y', 'x', 'v']);
    expect(payoffOrder(debts.slice(0, 2), 'avalanche')).toEqual(['y', 'x']);
  });

  it('breaks exact ties by id, whatever order the debts are listed in', () => {
    const [w, z] = [debts[3]!, debts[2]!];
    expect(payoffOrder([w, z], 'snowball')).toEqual(['w', 'z']);
    expect(payoffOrder([z, w], 'snowball')).toEqual(['w', 'z']);
  });

  it('own order: as given', () => {
    expect(payoffOrder(debts, 'custom', ['x', 'v', 'y', 'z', 'w'])).toEqual([
      'x',
      'v',
      'y',
      'z',
      'w',
    ]);
    // Extra money goes to B first, so B (the bigger debt) clears in month 2 and A in month 3.
    const plan = planDebts([zeroA, zeroB], 600, 'custom', { order: ['B', 'A'] });
    expect(plan.payoffMonth).toEqual({ A: 3, B: 2 });
  });

  it('refuses an own order that does not list every debt once', () => {
    expect(() => payoffOrder(debts, 'custom')).toThrow(RangeError);
    expect(() => payoffOrder(debts, 'custom', ['x', 'y', 'z', 'w'])).toThrow(RangeError);
    expect(() => payoffOrder(debts, 'custom', ['x', 'y', 'z', 'w', 'w'])).toThrow(RangeError);
    expect(() => payoffOrder(debts, 'custom', ['x', 'y', 'z', 'w', 'q'])).toThrow(RangeError);
  });
});

describe('interestSaved', () => {
  const debts: Debt[] = [
    { id: 'C', name: 'Card', balance: 100000, aprBasisPoints: 2490, minimumPayment: 3000 },
  ];

  it('compares paying the minimum with paying the budget', () => {
    const saved = interestSaved(debts, 6000, 'avalanche');
    const minimumOnly = planDebts(debts, 3000, 'avalanche');
    const withBudget = planDebts(debts, 6000, 'avalanche');
    expect(saved).toBe(minimumOnly.totalInterest - withBudget.totalInterest);
    expect(saved).toBeGreaterThan(0);
  });

  it('is null when minimum payments alone never clear the debt', () => {
    expect(interestSaved([{ ...debts[0]!, minimumPayment: 1000 }], 6000, 'avalanche')).toBeNull();
  });

  it('is null when the budget plan fails', () => {
    expect(interestSaved(debts, 1000, 'avalanche')).toBeNull();
  });

  it('works with the user’s own order', () => {
    const two: Debt[] = [
      { id: 'X', name: 'Card', balance: 50000, aprBasisPoints: 2990, minimumPayment: 2000 },
      { id: 'Y', name: 'Loan', balance: 80000, aprBasisPoints: 900, minimumPayment: 3000 },
    ];
    const saved = interestSaved(two, 10000, 'custom', { order: ['Y', 'X'] });
    const minimumOnly = planDebts(two, 5000, 'custom', { order: ['Y', 'X'] });
    const withBudget = planDebts(two, 10000, 'custom', { order: ['Y', 'X'] });
    expect(saved).toBe(minimumOnly.totalInterest - withBudget.totalInterest);
    expect(saved).toBeGreaterThan(0);
  });
});
