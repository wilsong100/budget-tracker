import { describe, expect, it } from 'vitest';
import {
  isaAllowance,
  monthlyShare,
  sinkingFundShare,
  taxYearEnd,
  taxYearLabel,
  taxYearStart,
} from './pots';

describe('monthlyShare', () => {
  it('rounds up so the target is always met', () => {
    expect(monthlyShare(19000, 0, 7)).toBe(2715);
    expect(monthlyShare(70000, 0, 7)).toBe(10000);
  });

  it('is zero once the target is reached', () => {
    expect(monthlyShare(10000, 10000, 3)).toBe(0);
    expect(monthlyShare(10000, 12000, 3)).toBe(0);
  });

  it('asks for the rest at once when no saving dates are left', () => {
    expect(monthlyShare(10000, 4000, 0)).toBe(6000);
  });

  it('refuses bad input', () => {
    expect(() => monthlyShare(-1, 0, 1)).toThrow(RangeError);
    expect(() => monthlyShare(100, 0.5, 1)).toThrow(RangeError);
    expect(() => monthlyShare(100, 0, -1)).toThrow(RangeError);
    expect(() => monthlyShare(100, 0, 1.5)).toThrow(RangeError);
  });
});

describe('sinkingFundShare', () => {
  it('spreads car tax over the saving days left before it is due', () => {
    // 1 Dec to 1 Jun is 7 saving days.
    expect(
      sinkingFundShare({ target: 19000, saved: 0, targetDate: '2027-06-01', day: 1 }, '2026-11-21'),
    ).toEqual({ share: 2715, savingDates: 7 });
  });

  it('counts today when today is a saving day', () => {
    expect(
      sinkingFundShare(
        { target: 60000, saved: 10000, targetDate: '2026-12-20', day: 21 },
        '2026-11-21',
      ),
    ).toEqual({ share: 50000, savingDates: 1 });
  });

  it('asks for the rest at once when the date has passed', () => {
    expect(
      sinkingFundShare(
        { target: 60000, saved: 10000, targetDate: '2026-11-01', day: 1 },
        '2026-11-21',
      ),
    ).toEqual({ share: 50000, savingDates: 0 });
  });
});

describe('UK tax year', () => {
  it.each([
    ['2026-04-05', '2025-04-06', '2026-04-05', '2025/26'],
    ['2026-04-06', '2026-04-06', '2027-04-05', '2026/27'],
    ['2026-11-21', '2026-04-06', '2027-04-05', '2026/27'],
    ['2027-01-01', '2026-04-06', '2027-04-05', '2026/27'],
    ['2099-12-31', '2099-04-06', '2100-04-05', '2099/00'],
  ])('%s is in the tax year %s to %s (%s)', (date, start, end, label) => {
    expect(taxYearStart(date)).toBe(start);
    expect(taxYearEnd(date)).toBe(end);
    expect(taxYearLabel(date)).toBe(label);
  });
});

describe('isaAllowance', () => {
  const payments = [
    { date: '2026-04-05', amount: 500000 }, // last tax year
    { date: '2026-04-06', amount: 300000 },
    { date: '2027-01-10', amount: 200000 },
    { date: '2027-04-06', amount: 100000 }, // next tax year
  ];

  it('counts only payments in the current tax year', () => {
    expect(isaAllowance(2000000, payments, '2027-02-01')).toEqual({
      taxYear: '2026/27',
      used: 500000,
      remaining: 1500000,
      over: 0,
    });
  });

  it('reports going over the allowance', () => {
    expect(isaAllowance(400000, payments, '2027-02-01')).toEqual({
      taxYear: '2026/27',
      used: 500000,
      remaining: 0,
      over: 100000,
    });
  });

  it('refuses a bad allowance', () => {
    expect(() => isaAllowance(-1, [], '2027-02-01')).toThrow(RangeError);
  });
});
