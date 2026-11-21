import { describe, expect, it } from 'vitest';
import { dueCommitments, safeToSpend, type Commitment, type SafeToSpendInput } from './safeToSpend';

const commitments: Commitment[] = [
  {
    key: 'council:2026-12-01',
    label: 'Council tax',
    kind: 'bill',
    date: '2026-12-01',
    amount: 15000,
  }, // after payday
  {
    key: 'broadband:2026-11-23',
    label: 'Broadband',
    kind: 'bill',
    date: '2026-11-23',
    amount: 3000,
  },
  { key: 'mobile:2026-11-25', label: 'Mobile', kind: 'bill', date: '2026-11-25', amount: 1500 }, // on payday
  { key: 'stream:2026-11-21', label: 'Streaming', kind: 'bill', date: '2026-11-21', amount: 1099 }, // today
  { key: 'xmas:2026-11-24', label: 'Christmas pot', kind: 'pot', date: '2026-11-24', amount: 5000 },
];

const base: SafeToSpendInput = {
  today: '2026-11-21',
  nextPayday: '2026-11-25',
  balance: 50000,
  commitments,
  buffer: 2000,
  overdraft: { include: false, limit: 50000 },
};

describe('safeToSpend', () => {
  it('follows the formula in docs/PLAN.md', () => {
    const result = safeToSpend(base);
    // 500.00 − 30.00 − 15.00 − 10.99 − 50.00 − 20.00 = 374.01, over 4 days (21st to 24th).
    expect(result.leftUntilPayday).toBe(37401);
    expect(result.daysUntilPayday).toBe(4);
    expect(result.safeToday).toBe(9350); // rounded down, never up
  });

  it('itemises every figure, in date order, and the lines add up', () => {
    const { lines, leftUntilPayday } = safeToSpend(base);
    expect(lines).toEqual([
      { kind: 'balance', label: 'In your account now', amount: 50000 },
      { kind: 'bill', label: 'Streaming', amount: -1099, date: '2026-11-21' },
      { kind: 'bill', label: 'Broadband', amount: -3000, date: '2026-11-23' },
      { kind: 'pot', label: 'Christmas pot', amount: -5000, date: '2026-11-24' },
      { kind: 'bill', label: 'Mobile', amount: -1500, date: '2026-11-25' },
      { kind: 'buffer', label: 'Buffer', amount: -2000 },
    ]);
    expect(lines.reduce((total, line) => total + line.amount, 0)).toBe(leftUntilPayday);
  });

  it('orders same-day commitments by label', () => {
    const { lines } = safeToSpend({
      ...base,
      buffer: 0,
      commitments: [
        { key: 'b', label: 'Water', kind: 'bill', date: '2026-11-22', amount: 100 },
        { key: 'a', label: 'Energy', kind: 'bill', date: '2026-11-22', amount: 100 },
      ],
    });
    expect(lines.map((line) => line.label)).toEqual(['In your account now', 'Energy', 'Water']);
  });

  it('counts an arranged overdraft only when switched on', () => {
    const result = safeToSpend({ ...base, overdraft: { include: true, limit: 50000 } });
    expect(result.leftUntilPayday).toBe(87401);
    expect(result.lines.at(-1)).toEqual({
      kind: 'overdraft',
      label: 'Arranged overdraft',
      amount: 50000,
    });
  });

  it('leaves out a zero buffer and a zero overdraft', () => {
    const result = safeToSpend({ ...base, buffer: 0, overdraft: { include: true, limit: 0 } });
    expect(result.lines.map((line) => line.kind)).not.toContain('buffer');
    expect(result.lines.map((line) => line.kind)).not.toContain('overdraft');
  });

  it('includes overdue unpaid commitments the caller passes in', () => {
    const result = safeToSpend({
      ...base,
      buffer: 0,
      commitments: [
        { key: 'late', label: 'Late bill', kind: 'bill', date: '2026-11-10', amount: 1000 },
      ],
    });
    expect(result.leftUntilPayday).toBe(49000);
  });

  it('spreads a shortfall across the days left, rounding down', () => {
    const result = safeToSpend({
      ...base,
      balance: 1000,
      buffer: 0,
      commitments: [{ key: 'rent', label: 'Rent', kind: 'bill', date: '2026-11-22', amount: 5001 }],
    });
    expect(result.leftUntilPayday).toBe(-4001);
    expect(result.safeToday).toBe(-1001);
  });

  it('gives the whole amount when payday is tomorrow', () => {
    const result = safeToSpend({ ...base, today: '2026-11-24', commitments: [], buffer: 0 });
    expect(result.daysUntilPayday).toBe(1);
    expect(result.safeToday).toBe(50000);
  });

  it("raises tomorrow's figure when you spend less than today's", () => {
    const later: Commitment[] = [
      { key: 'x', label: 'Bill', kind: 'bill', date: '2026-11-24', amount: 3000 },
    ];
    const today = safeToSpend({ ...base, commitments: later });
    const tomorrowAfter = (spent: number) =>
      safeToSpend({
        ...base,
        today: '2026-11-22',
        balance: base.balance - spent,
        commitments: later,
      }).safeToday;
    for (const spent of [0, 1000, 5000]) {
      expect(tomorrowAfter(spent)).toBeGreaterThan(today.safeToday);
    }
    // Spending up to today's figure never lowers tomorrow's (rounding down can make them equal).
    for (const spent of [today.safeToday - 1, today.safeToday]) {
      expect(tomorrowAfter(spent)).toBeGreaterThanOrEqual(today.safeToday);
    }
    const overspent = safeToSpend({
      ...base,
      today: '2026-11-22',
      balance: base.balance - today.safeToday * 2,
      commitments: later,
    });
    expect(overspent.safeToday).toBeLessThan(today.safeToday);
  });

  it('refuses bad input', () => {
    expect(() => safeToSpend({ ...base, nextPayday: '2026-11-21' })).toThrow(RangeError);
    expect(() => safeToSpend({ ...base, balance: 10.5 })).toThrow(RangeError);
    expect(() => safeToSpend({ ...base, buffer: -1 })).toThrow(RangeError);
    expect(() => safeToSpend({ ...base, overdraft: { include: true, limit: -1 } })).toThrow(
      RangeError,
    );
    expect(() =>
      safeToSpend({
        ...base,
        commitments: [{ key: 'k', label: 'Bad', kind: 'bill', date: '2026-11-22', amount: -5 }],
      }),
    ).toThrow(RangeError);
    expect(() => safeToSpend({ ...base, today: '2026-02-30' })).toThrow(RangeError);
  });
});

describe('dueCommitments', () => {
  it('lists unpaid occurrences from today to payday, keyed by id and date', () => {
    const due = dueCommitments(
      [
        {
          id: 'gym',
          label: 'Gym',
          kind: 'bill',
          amount: 2500,
          rule: { kind: 'everyNWeeks', weeks: 1, anchor: '2026-11-02' },
        },
        {
          id: 'tv',
          label: 'TV licence',
          kind: 'bill',
          amount: 1475,
          rule: { kind: 'once', date: '2026-12-10' },
        },
        {
          id: 'pot',
          label: 'Holiday pot',
          kind: 'pot',
          amount: 5000,
          rule: { kind: 'everyNMonths', months: 1, day: 1, anchor: '2026-01-01' },
        },
      ],
      '2026-11-21',
      '2026-12-04',
      new Set(['gym:2026-11-23']),
    );
    expect(due).toEqual([
      { key: 'gym:2026-11-30', label: 'Gym', kind: 'bill', date: '2026-11-30', amount: 2500 },
      {
        key: 'pot:2026-12-01',
        label: 'Holiday pot',
        kind: 'pot',
        date: '2026-12-01',
        amount: 5000,
      },
    ]);
  });
});
