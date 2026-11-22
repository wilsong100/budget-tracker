import { describe, expect, it } from 'vitest';
import { calendarMonth, shiftMonth } from './calendar';
import type { RecurringItem } from './safeToSpend';

const energy: RecurringItem = {
  id: 'e',
  label: 'Energy',
  kind: 'bill',
  amount: 9500,
  rule: { kind: 'everyNMonths', months: 1, day: 25, anchor: '2026-01-01' },
};
const gym: RecurringItem = {
  id: 'g',
  label: 'Gym',
  kind: 'bill',
  amount: 3000,
  rule: { kind: 'everyNWeeks', weeks: 1, anchor: '2026-11-02' },
};
const pot: RecurringItem = {
  id: 'p',
  label: 'Holiday',
  kind: 'pot',
  amount: 5000,
  rule: { kind: 'everyNMonths', months: 1, day: 25, anchor: '2026-01-01' },
};

describe('calendarMonth', () => {
  it('lays a month out in Monday-start weeks, padded with the days either side', () => {
    // November 2026 starts on a Sunday and ends on a Monday.
    const weeks = calendarMonth('2026-11', [], []);
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]![0]).toMatchObject({ date: '2026-10-26', inMonth: false });
    expect(weeks[0]![6]).toMatchObject({ date: '2026-11-01', inMonth: true });
    expect(weeks[5]![0]).toMatchObject({ date: '2026-11-30', inMonth: true });
    expect(weeks[5]![6]).toMatchObject({ date: '2026-12-06', inMonth: false });
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(30);
  });

  it('needs only four weeks for a February that starts on a Monday', () => {
    const weeks = calendarMonth('2027-02', [], []);
    expect(weeks).toHaveLength(4);
    expect(weeks[0]![0]!.date).toBe('2027-02-01');
    expect(weeks[3]![6]!.date).toBe('2027-02-28');
  });

  it('handles a leap-year February', () => {
    const days = calendarMonth('2028-02', [], []).flat();
    expect(days.filter((d) => d.inMonth).at(-1)!.date).toBe('2028-02-29');
  });

  it('puts each bill and pot payment on its day, in label order, for this month only', () => {
    const days = calendarMonth('2026-11', [pot, gym, energy], []).flat();
    const on = (date: string) => days.find((d) => d.date === date)!;
    expect(on('2026-11-25').items.map((c) => c.label)).toEqual(['Energy', 'Holiday']);
    expect(on('2026-11-25').total).toBe(14500);
    expect(on('2026-11-23').items.map((c) => c.key)).toEqual(['g:2026-11-23']);
    // Padding days belong to other months, so nothing is shown on them.
    expect(on('2026-10-26').items).toEqual([]);
    expect(on('2026-11-24').items).toEqual([]);
    expect(on('2026-11-24').total).toBe(0);
  });

  it('marks paydays', () => {
    const days = calendarMonth('2026-11', [], ['2026-11-27', '2026-12-31']).flat();
    expect(days.filter((d) => d.payday).map((d) => d.date)).toEqual(['2026-11-27']);
  });
});

describe('shiftMonth', () => {
  it('moves forwards and back across years', () => {
    expect(shiftMonth('2026-11', 1)).toBe('2026-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-11', -23)).toBe('2024-12');
  });

  it('refuses a month key that isn’t one', () => {
    expect(() => shiftMonth('2026-13', 1)).toThrow(RangeError);
    expect(() => calendarMonth('nope', [], [])).toThrow(RangeError);
  });
});
