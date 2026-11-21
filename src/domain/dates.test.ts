import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  compareIso,
  dateInMonth,
  dayOfWeek,
  daysInMonth,
  diffDays,
  formatUkDate,
  fromDayNumber,
  isIsoDate,
  isLeapYear,
  isoDate,
  isWeekend,
  maxDate,
  minDate,
  monthKey,
  monthsBetween,
  parseIso,
  parseUkDate,
  toDayNumber,
  todayInLondon,
} from './dates';

describe('parseIso and isIsoDate', () => {
  it('reads a valid date', () => {
    expect(parseIso('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it.each([
    '2027-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-1-1',
    '26-01-01',
    '2026-01-01T00:00',
    '',
    '2026-01-00',
  ])('refuses %j', (input) => {
    expect(isIsoDate(input)).toBe(false);
    expect(() => parseIso(input)).toThrow(RangeError);
  });

  it('refuses non-strings', () => {
    expect(isIsoDate(20260101)).toBe(false);
  });
});

describe('isoDate', () => {
  it('builds a padded date', () => {
    expect(isoDate(2026, 3, 5)).toBe('2026-03-05');
  });

  it('refuses impossible dates', () => {
    expect(() => isoDate(2026, 2, 29)).toThrow(RangeError);
    expect(() => isoDate(2026, 1, 1.5)).toThrow(RangeError);
    expect(() => isoDate(-1, 1, 1)).toThrow(RangeError);
  });
});

describe('day numbers', () => {
  it('counts days from 1970-01-01', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(toDayNumber('1969-12-31')).toBe(-1);
    expect(toDayNumber('2026-11-21')).toBe(20778);
    expect(toDayNumber('2000-03-01')).toBe(11017);
  });

  it('round-trips every day from 1899 to 2101', () => {
    const start = toDayNumber('1899-01-01');
    const end = toDayNumber('2101-12-31');
    for (let n = start; n <= end; n++) {
      expect(toDayNumber(fromDayNumber(n))).toBe(n);
    }
  });

  it('refuses a non-integer day number', () => {
    expect(() => fromDayNumber(1.5)).toThrow(RangeError);
  });
});

describe('addDays and diffDays', () => {
  it('crosses month, year and leap-day boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('is unaffected by the BST changes', () => {
    // Clocks go forward on 29 March 2026 and back on 25 October 2026.
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(diffDays('2026-03-30', '2026-03-28')).toBe(2);
    expect(diffDays('2026-10-26', '2026-10-24')).toBe(2);
  });

  it('counts the days between two dates', () => {
    expect(diffDays('2026-12-25', '2026-11-21')).toBe(34);
    expect(diffDays('2026-11-21', '2026-12-25')).toBe(-34);
    expect(diffDays('2029-01-01', '2028-01-01')).toBe(366);
  });
});

describe('dayOfWeek and isWeekend', () => {
  it('numbers Monday as 1 and Sunday as 7', () => {
    expect(dayOfWeek('2026-11-23')).toBe(1);
    expect(dayOfWeek('2026-11-21')).toBe(6);
    expect(dayOfWeek('2026-11-22')).toBe(7);
    expect(dayOfWeek('1970-01-01')).toBe(4);
    expect(dayOfWeek('1969-12-29')).toBe(1);
  });

  it('knows the weekend', () => {
    expect(isWeekend('2026-11-21')).toBe(true);
    expect(isWeekend('2026-11-22')).toBe(true);
    expect(isWeekend('2026-11-23')).toBe(false);
    expect(isWeekend('2026-11-27')).toBe(false);
  });
});

describe('leap years and month lengths', () => {
  it.each([
    [2026, false],
    [2028, true],
    [2100, false],
    [2000, true],
  ])('%i leap: %s', (year, leap) => {
    expect(isLeapYear(year)).toBe(leap);
  });

  it('knows how long each month is', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
    expect(() => daysInMonth(2026, 13)).toThrow(RangeError);
  });
});

describe('dateInMonth', () => {
  it('clamps a day past the month end', () => {
    expect(dateInMonth(2026, 2, 31)).toBe('2026-02-28');
    expect(dateInMonth(2028, 2, 30)).toBe('2028-02-29');
    expect(dateInMonth(2026, 4, 31)).toBe('2026-04-30');
    expect(dateInMonth(2026, 1, 15)).toBe('2026-01-15');
  });

  it("takes 'last' as the month's last day", () => {
    expect(dateInMonth(2026, 2, 'last')).toBe('2026-02-28');
    expect(dateInMonth(2026, 12, 'last')).toBe('2026-12-31');
  });

  it('refuses a day outside 1–31', () => {
    expect(() => dateInMonth(2026, 1, 0)).toThrow(RangeError);
    expect(() => dateInMonth(2026, 1, 32)).toThrow(RangeError);
  });
});

describe('addMonths and month keys', () => {
  it('keeps the day where it can and clamps where it cannot', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-01-15', 12)).toBe('2027-01-15');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-10', -13)).toBe('2024-12-10');
  });

  it('gives the month as YYYY-MM', () => {
    expect(monthKey('2026-11-21')).toBe('2026-11');
  });

  it('counts whole calendar months between two dates', () => {
    expect(monthsBetween('2026-11-21', '2026-12-01')).toBe(1);
    expect(monthsBetween('2026-01-31', '2027-01-01')).toBe(12);
    expect(monthsBetween('2026-05-01', '2026-03-31')).toBe(-2);
  });
});

describe('minDate and maxDate', () => {
  it('pick the earlier and later date', () => {
    expect(minDate('2026-01-02', '2025-12-31')).toBe('2025-12-31');
    expect(maxDate('2026-01-02', '2025-12-31')).toBe('2026-01-02');
    expect(minDate('2025-12-31', '2026-01-02')).toBe('2025-12-31');
    expect(maxDate('2025-12-31', '2026-01-02')).toBe('2026-01-02');
  });

  it('sorts dates', () => {
    expect(['2026-03-01', '2025-12-31', '2026-03-01', '2026-01-15'].sort(compareIso)).toEqual([
      '2025-12-31',
      '2026-01-15',
      '2026-03-01',
      '2026-03-01',
    ]);
  });
});

describe('UK date format', () => {
  it('shows dd/mm/yyyy', () => {
    expect(formatUkDate('2026-03-05')).toBe('05/03/2026');
  });

  it('reads dd/mm/yyyy and d/m/yyyy', () => {
    expect(parseUkDate('05/03/2026')).toBe('2026-03-05');
    expect(parseUkDate('5/3/2026')).toBe('2026-03-05');
    expect(parseUkDate(' 29/02/2028 ')).toBe('2028-02-29');
  });

  it.each(['29/02/2027', '31/04/2026', '2026-03-05', '05/03/26', '5-3-2026', ''])(
    'refuses %j',
    (input) => {
      expect(parseUkDate(input)).toBeNull();
    },
  );
});

describe('todayInLondon', () => {
  it.each([
    // Winter (GMT): London and UTC agree.
    ['2026-01-15T23:59:59Z', '2026-01-15'],
    ['2026-01-16T00:00:00Z', '2026-01-16'],
    // Clocks go forward at 01:00 UTC on 29 March 2026.
    ['2026-03-29T00:30:00Z', '2026-03-29'],
    ['2026-03-28T23:30:00Z', '2026-03-28'],
    // Summer (BST, UTC+1): 23:30 UTC is already tomorrow in London.
    ['2026-06-30T23:30:00Z', '2026-07-01'],
    ['2026-06-30T22:59:59Z', '2026-06-30'],
    // Clocks go back at 01:00 UTC on 25 October 2026.
    ['2026-10-24T23:30:00Z', '2026-10-25'],
    ['2026-10-25T23:30:00Z', '2026-10-25'],
    // New Year's Eve in winter.
    ['2026-12-31T23:59:00Z', '2026-12-31'],
  ])('at %s it is %s in London', (instant, expected) => {
    expect(todayInLondon(new Date(instant))).toBe(expected);
    expect(todayInLondon(Date.parse(instant))).toBe(expected);
  });

  it('refuses an invalid instant', () => {
    expect(() => todayInLondon(Number.NaN)).toThrow(RangeError);
  });
});
