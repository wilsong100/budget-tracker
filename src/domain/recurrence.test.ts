import { describe, expect, it } from 'vitest';
import { bundledBankHolidays } from './bankHolidays';
import { adjustedOccurrences, occurrences, type Recurrence } from './recurrence';

const england = bundledBankHolidays('england-and-wales');

describe('once', () => {
  const rule: Recurrence = { kind: 'once', date: '2026-12-01' };

  it('appears only inside the range', () => {
    expect(occurrences(rule, '2026-11-01', '2026-12-31')).toEqual(['2026-12-01']);
    expect(occurrences(rule, '2026-12-01', '2026-12-01')).toEqual(['2026-12-01']);
    expect(occurrences(rule, '2026-12-02', '2026-12-31')).toEqual([]);
  });
});

describe('every n weeks', () => {
  it('runs weekly in both directions from its anchor', () => {
    const rule: Recurrence = { kind: 'everyNWeeks', weeks: 1, anchor: '2026-11-23' };
    expect(occurrences(rule, '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
  });

  it('runs fortnightly and 4-weekly', () => {
    expect(
      occurrences(
        { kind: 'everyNWeeks', weeks: 2, anchor: '2026-01-02' },
        '2026-01-01',
        '2026-02-28',
      ),
    ).toEqual(['2026-01-02', '2026-01-16', '2026-01-30', '2026-02-13', '2026-02-27']);
    const fourWeekly = occurrences(
      { kind: 'everyNWeeks', weeks: 4, anchor: '2026-01-09' },
      '2026-01-01',
      '2026-12-31',
    );
    expect(fourWeekly).toHaveLength(13);
    expect(fourWeekly.at(-1)).toBe('2026-12-11');
  });

  it('respects start and end', () => {
    const rule: Recurrence = {
      kind: 'everyNWeeks',
      weeks: 1,
      anchor: '2026-11-02',
      start: '2026-11-09',
      end: '2026-11-23',
    };
    expect(occurrences(rule, '2026-10-01', '2026-12-31')).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
    ]);
  });
});

describe('every n months', () => {
  it('runs monthly, clamping short months', () => {
    const rule: Recurrence = { kind: 'everyNMonths', months: 1, day: 31, anchor: '2026-01-31' };
    expect(occurrences(rule, '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
  });

  it("supports the 'last' day", () => {
    const rule: Recurrence = { kind: 'everyNMonths', months: 1, day: 'last', anchor: '2028-01-31' };
    expect(occurrences(rule, '2028-02-01', '2028-03-31')).toEqual(['2028-02-29', '2028-03-31']);
  });

  it('runs quarterly and yearly, aligned to the anchor month', () => {
    expect(
      occurrences(
        { kind: 'everyNMonths', months: 3, day: 15, anchor: '2026-02-15' },
        '2026-01-01',
        '2026-12-31',
      ),
    ).toEqual(['2026-02-15', '2026-05-15', '2026-08-15', '2026-11-15']);
    expect(
      occurrences(
        { kind: 'everyNMonths', months: 12, day: 29, anchor: '2028-02-29' },
        '2026-01-01',
        '2029-12-31',
      ),
    ).toEqual(['2026-02-28', '2027-02-28', '2028-02-29', '2029-02-28']);
    expect(
      occurrences(
        { kind: 'everyNMonths', months: 6, day: 1, anchor: '2027-03-01' },
        '2026-01-01',
        '2026-12-31',
      ),
    ).toEqual(['2026-03-01', '2026-09-01']);
  });

  it('respects start and end', () => {
    const rule: Recurrence = {
      kind: 'everyNMonths',
      months: 1,
      day: 10,
      anchor: '2026-01-10',
      start: '2026-03-10',
      end: '2026-05-09',
    };
    expect(occurrences(rule, '2026-01-01', '2026-12-31')).toEqual(['2026-03-10', '2026-04-10']);
  });
});

describe('council tax', () => {
  it('takes 10 instalments, April to January, leaving February and March free', () => {
    const dates = occurrences(
      { kind: 'councilTax', instalments: 10, day: 1 },
      '2026-04-01',
      '2027-03-31',
    );
    expect(dates).toEqual([
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
    ]);
  });

  it('takes 12 instalments, April to March', () => {
    const dates = occurrences(
      { kind: 'councilTax', instalments: 12, day: 'last' },
      '2026-04-01',
      '2027-03-31',
    );
    expect(dates).toHaveLength(12);
    expect(dates.at(-1)).toBe('2027-03-31');
  });

  it('respects start and end', () => {
    const rule: Recurrence = {
      kind: 'councilTax',
      instalments: 10,
      day: 15,
      start: '2026-06-01',
      end: '2026-08-31',
    };
    expect(occurrences(rule, '2026-01-01', '2027-12-31')).toEqual([
      '2026-06-15',
      '2026-07-15',
      '2026-08-15',
    ]);
  });
});

describe('occurrences', () => {
  it('returns nothing for a range that ends before it starts', () => {
    expect(occurrences({ kind: 'once', date: '2026-01-01' }, '2026-02-01', '2026-01-01')).toEqual(
      [],
    );
  });

  it('refuses invalid rules', () => {
    expect(() =>
      occurrences(
        { kind: 'everyNWeeks', weeks: 3 as 2, anchor: '2026-01-01' },
        '2026-01-01',
        '2026-02-01',
      ),
    ).toThrow(RangeError);
    expect(() =>
      occurrences(
        { kind: 'everyNMonths', months: 5 as 3, day: 1, anchor: '2026-01-01' },
        '2026-01-01',
        '2026-02-01',
      ),
    ).toThrow(RangeError);
    expect(() =>
      occurrences(
        { kind: 'councilTax', instalments: 11 as 10, day: 1 },
        '2026-01-01',
        '2026-02-01',
      ),
    ).toThrow(RangeError);
    expect(() =>
      occurrences(
        { kind: 'everyNMonths', months: 1, day: 0, anchor: '2026-01-01' },
        '2026-01-01',
        '2026-02-01',
      ),
    ).toThrow(RangeError);
    expect(() =>
      occurrences({ kind: 'nope' } as unknown as Recurrence, '2026-01-01', '2026-02-01'),
    ).toThrow(RangeError);
  });
});

describe('adjustedOccurrences', () => {
  const firstOfMonth: Recurrence = {
    kind: 'everyNMonths',
    months: 1,
    day: 1,
    anchor: '2026-01-01',
  };

  it('leaves dates alone with no adjustment', () => {
    expect(adjustedOccurrences(firstOfMonth, '2026-08-01', '2026-08-31', 'none', england)).toEqual([
      { nominal: '2026-08-01', date: '2026-08-01' },
    ]);
  });

  it('moves a non-working day back, even into the previous range', () => {
    // 1 January 2027 is a bank holiday, so it moves to 31 December 2026.
    expect(
      adjustedOccurrences(firstOfMonth, '2026-12-15', '2026-12-31', 'previous', england),
    ).toEqual([{ nominal: '2027-01-01', date: '2026-12-31' }]);
    expect(
      adjustedOccurrences(firstOfMonth, '2027-01-01', '2027-01-31', 'previous', england),
    ).toEqual([]);
  });

  it('moves a non-working day forward', () => {
    // 1 August 2026 is a Saturday.
    expect(adjustedOccurrences(firstOfMonth, '2026-08-01', '2026-08-31', 'next', england)).toEqual([
      { nominal: '2026-08-01', date: '2026-08-03' },
    ]);
  });
});
