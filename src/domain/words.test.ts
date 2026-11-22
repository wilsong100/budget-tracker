import { describe, expect, it } from 'vitest';
import {
  describePayCycle,
  describeRecurrence,
  formatLongDate,
  formatMediumDate,
  formatMonth,
  formatShortDate,
  ordinal,
  parseQuickSpend,
  suggestCategory,
} from './words';

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [28, '28th'],
    [31, '31st'],
    [111, '111th'],
  ])('%i → %s', (n, word) => expect(ordinal(n)).toBe(word));
});

describe('dates in words', () => {
  it('gives short and medium dates', () => {
    expect(formatShortDate('2026-11-27')).toBe('Fri 27 Nov');
    expect(formatShortDate('2026-11-29')).toBe('Sun 29 Nov');
    expect(formatMediumDate('2027-01-01')).toBe('1 Jan 2027');
  });
});

describe('describeRecurrence', () => {
  it.each([
    [{ kind: 'once', date: '2026-12-01' } as const, 'Once, on 1 Dec 2026'],
    [{ kind: 'everyNWeeks', weeks: 1, anchor: '2026-11-21' } as const, 'Weekly'],
    [{ kind: 'everyNWeeks', weeks: 2, anchor: '2026-11-21' } as const, 'Every 2 weeks'],
    [{ kind: 'everyNWeeks', weeks: 4, anchor: '2026-11-21' } as const, 'Every 4 weeks'],
    [
      { kind: 'everyNMonths', months: 1, day: 25, anchor: '2026-11-25' } as const,
      'Monthly on the 25th',
    ],
    [
      { kind: 'everyNMonths', months: 1, day: 'last', anchor: '2026-11-30' } as const,
      'Monthly on the last day',
    ],
    [
      { kind: 'everyNMonths', months: 3, day: 1, anchor: '2026-12-01' } as const,
      'Every 3 months on the 1st',
    ],
    [
      { kind: 'everyNMonths', months: 6, day: 2, anchor: '2026-12-02' } as const,
      'Every 6 months on the 2nd',
    ],
    [
      { kind: 'everyNMonths', months: 12, day: 14, anchor: '2027-03-14' } as const,
      'Yearly on 14 Mar',
    ],
    [
      { kind: 'everyNMonths', months: 12, day: 'last', anchor: '2027-02-28' } as const,
      'Yearly on the last day of Feb',
    ],
    [
      { kind: 'councilTax', instalments: 10, day: 1 } as const,
      '10 payments, April to January, on the 1st',
    ],
    [
      { kind: 'councilTax', instalments: 12, day: 15 } as const,
      '12 payments, April to March, on the 15th',
    ],
  ])('%j', (rule, words) => expect(describeRecurrence(rule)).toBe(words));
});

describe('describePayCycle', () => {
  it.each([
    [{ kind: 'monthly', day: 28 } as const, 'Monthly on the 28th'],
    [{ kind: 'lastWorkingDay' } as const, 'Last working day of the month'],
    [{ kind: 'fourWeekly', anchor: '2026-11-27' } as const, 'Every 4 weeks'],
    [{ kind: 'fortnightly', anchor: '2026-11-27' } as const, 'Every 2 weeks'],
    [{ kind: 'weekly', anchor: '2026-11-27' } as const, 'Weekly'],
  ])('%j', (cycle, words) => expect(describePayCycle(cycle)).toBe(words));
});

describe('parseQuickSpend', () => {
  it.each([
    ['coffee 3.40', { label: 'coffee', amount: 340 }],
    ['  lunch   with Sam  12 ', { label: 'lunch with Sam', amount: 1200 }],
    ['£12.50 taxi', { label: 'taxi', amount: 1250 }],
    ['4.5', { label: '', amount: 450 }],
    ['bus £1,250', { label: 'bus', amount: 125000 }],
    ['7 eleven 2.10', { label: '7 eleven', amount: 210 }],
  ])('%s', (line, spend) => expect(parseQuickSpend(line)).toEqual(spend));

  it.each(['', 'coffee', 'coffee -3', 'coffee 0', '0 coffee', 'coffee 3.456'])(
    'refuses %j',
    (line) => expect(parseQuickSpend(line)).toBeNull(),
  );
});

describe('suggestCategory', () => {
  const history = [
    { label: 'Coffee', category: 'eating-out', at: 1 },
    { label: 'coffee  beans', category: 'groceries', at: 2 },
    { label: 'Tesco', category: null, at: 3 },
    { label: 'Tesco', category: 'groceries', at: 0 },
    { label: 'Bus', category: 'transport', at: 4 },
  ];

  it('uses the latest spend with the same label', () => {
    expect(suggestCategory(' COFFEE ', history)).toBe('eating-out');
    expect(suggestCategory('coffee beans', history)).toBe('groceries');
    expect(suggestCategory('tesco', history)).toBe('groceries');
  });

  it('falls back to the first word', () => {
    expect(suggestCategory('coffee with Jo', history)).toBe('groceries');
    expect(suggestCategory('bus home', history)).toBe('transport');
  });

  it('gives nothing when there is nothing to go on', () => {
    expect(suggestCategory('cinema', history)).toBeNull();
    expect(suggestCategory('  ', history)).toBeNull();
    expect(suggestCategory('coffee', [])).toBeNull();
  });
});

describe('formatMonth and formatLongDate', () => {
  it('names a month in full', () => {
    expect(formatMonth('2026-11')).toBe('November 2026');
    expect(formatMonth('2027-01')).toBe('January 2027');
  });

  it('names a day in full, for screen readers', () => {
    expect(formatLongDate('2026-11-23')).toBe('Monday 23 November');
    expect(formatLongDate('2027-02-28')).toBe('Sunday 28 February');
  });

  it('refuses what isn’t a month', () => {
    expect(() => formatMonth('2026-13')).toThrow(RangeError);
  });
});
