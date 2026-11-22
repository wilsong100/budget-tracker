import { describe, expect, it } from 'vitest';
import { bundledBankHolidays } from './bankHolidays';
import { extraPaydaysAhead, paydayPlan } from './paydayPlan';
import type { RecurringItem } from './safeToSpend';

const EW = bundledBankHolidays('england-and-wales');
const monthly = (id: string, label: string, day: number, amount: number): RecurringItem => ({
  id,
  label,
  kind: 'bill',
  amount,
  rule: { kind: 'everyNMonths', months: 1, day, anchor: '2026-01-01' },
});
const rent = monthly('r', 'Rent', 1, 79500);
const energy = monthly('e', 'Energy', 25, 9500);
const mobile = monthly('m', 'Mobile', 28, 2000);

// Paid on the 28th. Sat 28 Nov 2026 moves to Fri 27 Nov; Mon 28 Dec is the Boxing Day
// substitute bank holiday, and Christmas is the Friday, so it moves to Thu 24 Dec.
const pay = { schedule: { cycle: { kind: 'monthly', day: 28 } as const }, amount: 200000 };

describe('paydayPlan', () => {
  it('lists what each coming payday covers: the day after it up to the next payday', () => {
    const plan = paydayPlan({
      pay,
      holidays: EW,
      items: [rent, energy, mobile],
      paid: new Set(),
      today: '2026-11-21',
      count: 3,
    });
    expect(plan.map((p) => [p.payday.date, p.until])).toEqual([
      ['2026-11-27', '2026-12-24'],
      ['2026-12-24', '2027-01-28'],
      ['2027-01-28', '2027-02-26'],
    ]);
    const [nov, dec] = plan;
    expect(nov!.commitments.map((c) => c.key)).toEqual(['m:2026-11-28', 'r:2026-12-01']);
    expect(nov!.total).toBe(81500);
    expect(nov!.left).toBe(118500);
    // Energy on Christmas Day lands after the early 24 Dec payday, so that payday covers it.
    expect(dec!.commitments.map((c) => c.key)).toEqual([
      'e:2026-12-25',
      'm:2026-12-28',
      'r:2027-01-01',
      'e:2027-01-25',
      'm:2027-01-28',
    ]);
    expect(dec!.total).toBe(9500 + 2000 + 79500 + 9500 + 2000);
  });

  it('leaves out anything already ticked off as paid', () => {
    const plan = paydayPlan({
      pay,
      holidays: EW,
      items: [rent, mobile],
      paid: new Set(['r:2026-12-01']),
      today: '2026-11-21',
      count: 1,
    });
    expect(plan[0]!.commitments.map((c) => c.label)).toEqual(['Mobile']);
    expect(plan[0]!.total).toBe(2000);
  });

  it('shows a shortfall as a negative amount left', () => {
    const plan = paydayPlan({
      pay: { ...pay, amount: 50000 },
      holidays: EW,
      items: [rent],
      paid: new Set(),
      today: '2026-11-21',
      count: 1,
    });
    expect(plan[0]!.left).toBe(-29500);
  });

  it('starts from the payday after today, even on payday itself', () => {
    const plan = paydayPlan({
      pay,
      holidays: EW,
      items: [],
      paid: new Set(),
      today: '2026-11-27',
      count: 1,
    });
    expect(plan[0]!.payday.date).toBe('2026-12-24');
    expect(plan[0]!.commitments).toEqual([]);
    expect(plan[0]!.total).toBe(0);
    expect(plan[0]!.left).toBe(200000);
  });

  it('refuses a count below one', () => {
    expect(() =>
      paydayPlan({ pay, holidays: EW, items: [], paid: new Set(), today: '2026-11-21', count: 0 }),
    ).toThrow(RangeError);
  });
});

describe('extraPaydaysAhead', () => {
  it('flags months with 3 fortnightly paydays over the coming year', () => {
    const schedule = { cycle: { kind: 'fortnightly', anchor: '2026-01-02' } as const };
    expect(extraPaydaysAhead(schedule, EW, '2026-11-21', 12)).toEqual([
      { month: '2026-12', count: 3 },
      { month: '2027-07', count: 3 },
    ]);
  });

  it('counts the whole of this month, and stops after the span', () => {
    const schedule = { cycle: { kind: 'fortnightly', anchor: '2026-01-02' } as const };
    expect(extraPaydaysAhead(schedule, EW, '2026-12-31', 1)).toEqual([
      { month: '2026-12', count: 3 },
    ]);
    expect(extraPaydaysAhead(schedule, EW, '2027-01-01', 6)).toEqual([]);
  });

  it('flags months with 5 weekly paydays', () => {
    // Mondays. Nov 2026 has five. Mon 28 Dec moves to Thu 24 Dec, still December, which has
    // four; so does January 2027.
    const schedule = { cycle: { kind: 'weekly', anchor: '2026-01-05' } as const };
    expect(extraPaydaysAhead(schedule, EW, '2026-11-21', 3)).toEqual([
      { month: '2026-11', count: 5 },
    ]);
  });

  it('finds none for monthly pay', () => {
    expect(extraPaydaysAhead(pay.schedule, EW, '2026-11-21', 12)).toEqual([]);
  });

  it('refuses a span below one month', () => {
    expect(() => extraPaydaysAhead(pay.schedule, EW, '2026-11-21', 0)).toThrow(RangeError);
  });
});
