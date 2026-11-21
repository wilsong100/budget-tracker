import { describe, expect, it } from 'vitest';
import { PAYDAY_TABLES } from './__fixtures__/payday-tables';
import { bundledBankHolidays, type Region } from './bankHolidays';
import {
  extraPaydayMonths,
  nextPayday,
  payPeriod,
  paydaysBetween,
  previousPayday,
  type PayCycle,
  type PaySchedule,
} from './paydays';

const FROM = '2026-01-01';
const TO = '2028-12-31';

const cases: [string, PayCycle, Region][] = [
  ['monthly25EW', { kind: 'monthly', day: 25 }, 'england-and-wales'],
  ['monthly1EW', { kind: 'monthly', day: 1 }, 'england-and-wales'],
  ['monthly31EW', { kind: 'monthly', day: 31 }, 'england-and-wales'],
  ['monthly13NI', { kind: 'monthly', day: 13 }, 'northern-ireland'],
  ['lastWorkingDayEW', { kind: 'lastWorkingDay' }, 'england-and-wales'],
  ['lastWorkingDaySC', { kind: 'lastWorkingDay' }, 'scotland'],
  ['lastWorkingDayNI', { kind: 'lastWorkingDay' }, 'northern-ireland'],
  ['fourWeeklyEW', { kind: 'fourWeekly', anchor: '2026-01-09' }, 'england-and-wales'],
  ['fortnightlyEW', { kind: 'fortnightly', anchor: '2026-01-02' }, 'england-and-wales'],
  ['weeklyEW', { kind: 'weekly', anchor: '2026-01-05' }, 'england-and-wales'],
];

describe('every UK pay cycle, 2026 to 2028', () => {
  it.each(cases)('%s matches the oracle table', (name, cycle, region) => {
    const expected = PAYDAY_TABLES[name];
    expect(expected).toBeDefined();
    const actual = paydaysBetween({ cycle }, bundledBankHolidays(region), FROM, TO).map(
      (p) => [p.nominal, p.date] as const,
    );
    expect(actual).toEqual(expected);
  });

  it('gives 13 four-weekly paydays in each year', () => {
    const holidays = bundledBankHolidays('england-and-wales');
    for (const year of [2026, 2027, 2028]) {
      const paydays = paydaysBetween(
        { cycle: { kind: 'fourWeekly', anchor: '2026-01-09' } },
        holidays,
        `${year}-01-01`,
        `${year}-12-31`,
      );
      expect(paydays).toHaveLength(13);
    }
  });
});

describe('payday flags', () => {
  const holidays = bundledBankHolidays('england-and-wales');

  it('marks moved paydays', () => {
    const [christmas] = paydaysBetween(
      { cycle: { kind: 'monthly', day: 25 } },
      holidays,
      '2026-12-01',
      '2026-12-31',
    );
    expect(christmas).toEqual({
      nominal: '2026-12-25',
      date: '2026-12-24',
      moved: true,
      overridden: false,
    });
  });

  it('applies a per-payday override', () => {
    const schedule: PaySchedule = {
      cycle: { kind: 'monthly', day: 25 },
      overrides: { '2026-12-25': '2026-12-18' },
    };
    expect(paydaysBetween(schedule, holidays, '2026-12-01', '2026-12-31')).toEqual([
      { nominal: '2026-12-25', date: '2026-12-18', moved: true, overridden: true },
    ]);
    // The override can move a payday into an earlier range.
    expect(paydaysBetween(schedule, holidays, '2026-12-18', '2026-12-18')).toHaveLength(1);
  });

  it('refuses an override more than 31 days from its payday', () => {
    const schedule: PaySchedule = {
      cycle: { kind: 'monthly', day: 25 },
      overrides: { '2026-12-25': '2026-11-01' },
    };
    expect(() => paydaysBetween(schedule, holidays, '2026-12-01', '2026-12-31')).toThrow(
      RangeError,
    );
  });

  it('refuses a monthly day outside 1–31', () => {
    expect(() =>
      paydaysBetween({ cycle: { kind: 'monthly', day: 32 } }, holidays, FROM, TO),
    ).toThrow(RangeError);
  });
});

describe('next and previous payday', () => {
  const holidays = bundledBankHolidays('england-and-wales');
  const schedule: PaySchedule = { cycle: { kind: 'monthly', day: 25 } };

  it('finds the next payday strictly after today', () => {
    expect(nextPayday(schedule, holidays, '2026-11-21').date).toBe('2026-11-25');
    // On payday itself the money has arrived, so the next one is a month away.
    expect(nextPayday(schedule, holidays, '2026-11-25').date).toBe('2026-12-24');
  });

  it('finds the last payday on or before today', () => {
    expect(previousPayday(schedule, holidays, '2026-11-21').date).toBe('2026-10-23'); // 25 Oct is a Sunday
    expect(previousPayday(schedule, holidays, '2026-11-25').date).toBe('2026-11-25');
  });

  it('gives the current pay period', () => {
    expect(payPeriod(schedule, holidays, '2026-11-21')).toMatchObject({
      start: { date: '2026-10-23' },
      next: { date: '2026-11-25' },
    });
  });

  it('works for weekly pay and across years', () => {
    const weekly: PaySchedule = { cycle: { kind: 'weekly', anchor: '2026-01-02' } };
    expect(nextPayday(weekly, holidays, '2026-12-30').date).toBe('2026-12-31'); // 1 Jan 2027 is a holiday
    expect(previousPayday(weekly, holidays, '2027-01-04').date).toBe('2026-12-31');
  });
});

describe('extraPaydayMonths', () => {
  const holidays = bundledBankHolidays('england-and-wales');

  it('flags months with 3 fortnightly paydays', () => {
    expect(
      extraPaydayMonths({ cycle: { kind: 'fortnightly', anchor: '2026-01-02' } }, holidays, 2026),
    ).toEqual([
      { month: '2026-01', count: 3 },
      { month: '2026-07', count: 3 },
      // 1 January 2027 is a Friday bank holiday, so that payday moves back into December.
      { month: '2026-12', count: 3 },
    ]);
  });

  it('flags months with 5 weekly paydays', () => {
    const months = extraPaydayMonths(
      { cycle: { kind: 'weekly', anchor: '2026-01-02' } },
      holidays,
      2026,
    );
    expect(months.map((m) => m.month)).toEqual([
      '2026-01',
      '2026-05',
      '2026-07',
      '2026-10',
      '2026-12',
    ]);
    expect(months.every((m) => m.count === 5)).toBe(true);
  });

  it('flags the month with 2 four-weekly paydays', () => {
    expect(
      extraPaydayMonths({ cycle: { kind: 'fourWeekly', anchor: '2026-01-09' } }, holidays, 2026),
    ).toEqual([{ month: '2026-05', count: 2 }]);
  });

  it('flags nothing for monthly pay', () => {
    expect(extraPaydayMonths({ cycle: { kind: 'lastWorkingDay' } }, holidays, 2026)).toEqual([]);
  });
});
