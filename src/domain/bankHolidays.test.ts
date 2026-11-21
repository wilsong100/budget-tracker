import { describe, expect, it } from 'vitest';
import feed from './data/bank-holidays.json';
import {
  REGIONS,
  bundledBankHolidays,
  isBankHoliday,
  isWorkingDay,
  parseGovUkFeed,
  workingDayOnOrAfter,
  workingDayOnOrBefore,
} from './bankHolidays';

const england = bundledBankHolidays('england-and-wales');
const scotland = bundledBankHolidays('scotland');
const ni = bundledBankHolidays('northern-ireland');

describe('the bundled GOV.UK feed', () => {
  it('covers 2026 to 2028 in every region', () => {
    for (const region of REGIONS) {
      const calendar = bundledBankHolidays(region);
      expect(calendar.region).toBe(region);
      expect(calendar.firstYear).toBeLessThanOrEqual(2026);
      expect(calendar.lastYear).toBeGreaterThanOrEqual(2028);
    }
  });

  it('has the right holidays for each nation', () => {
    expect(isBankHoliday('2026-04-06', england)).toBe(true); // Easter Monday
    expect(isBankHoliday('2026-04-06', scotland)).toBe(false); // not in Scotland
    expect(isBankHoliday('2026-01-02', scotland)).toBe(true); // 2nd January
    expect(isBankHoliday('2026-01-02', england)).toBe(false);
    expect(isBankHoliday('2026-06-15', scotland)).toBe(true); // World Cup bank holiday
    expect(isBankHoliday('2026-08-03', scotland)).toBe(true); // Scottish summer holiday
    expect(isBankHoliday('2026-08-31', england)).toBe(true);
    expect(isBankHoliday('2026-03-17', ni)).toBe(true); // St Patrick's Day
    expect(isBankHoliday('2026-07-13', ni)).toBe(true); // Boyne substitute day
    expect(isBankHoliday('2026-12-28', england)).toBe(true); // Boxing Day substitute
  });
});

describe('isWorkingDay', () => {
  it('excludes weekends and bank holidays', () => {
    expect(isWorkingDay('2026-11-23', england)).toBe(true);
    expect(isWorkingDay('2026-11-21', england)).toBe(false);
    expect(isWorkingDay('2026-11-22', england)).toBe(false);
    expect(isWorkingDay('2026-12-25', england)).toBe(false);
    expect(isWorkingDay('2026-11-30', scotland)).toBe(false); // St Andrew's Day
    expect(isWorkingDay('2026-11-30', england)).toBe(true);
  });

  it('treats weekdays after the feed ends as working days', () => {
    expect(isWorkingDay('2029-01-02', england)).toBe(true);
  });
});

describe('moving to a working day', () => {
  it('leaves a working day alone', () => {
    expect(workingDayOnOrBefore('2026-11-23', england)).toBe('2026-11-23');
    expect(workingDayOnOrAfter('2026-11-23', england)).toBe('2026-11-23');
  });

  it('moves back over a weekend and bank holidays', () => {
    // Christmas 2027: Sat 25, Sun 26, Mon 27 (sub), Tue 28 (sub).
    expect(workingDayOnOrBefore('2027-12-28', england)).toBe('2027-12-24');
    expect(workingDayOnOrBefore('2026-04-06', england)).toBe('2026-04-02'); // Easter Monday → Thursday
  });

  it('moves forward over a weekend and bank holidays', () => {
    expect(workingDayOnOrAfter('2027-12-25', england)).toBe('2027-12-29');
    expect(workingDayOnOrAfter('2027-01-01', scotland)).toBe('2027-01-05');
  });
});

describe('parseGovUkFeed', () => {
  it('reads the real feed', () => {
    const parsed = parseGovUkFeed(feed);
    expect(parsed.scotland.dates.has('2026-11-30')).toBe(true);
    expect(parsed['england-and-wales'].firstYear).toBe(2019);
  });

  it('reads a minimal feed', () => {
    const parsed = parseGovUkFeed({
      'england-and-wales': {
        division: 'england-and-wales',
        events: [{ title: 'A', date: '2030-01-01' }],
      },
      scotland: { division: 'scotland', events: [{ title: 'B', date: '2030-01-02' }] },
      'northern-ireland': {
        division: 'northern-ireland',
        events: [{ title: 'C', date: '2030-03-17' }],
      },
    });
    expect(parsed['northern-ireland']).toMatchObject({ firstYear: 2030, lastYear: 2030 });
  });

  it.each([
    ['not an object', null],
    ['an array', []],
    ['a missing region', { 'england-and-wales': { events: [] }, scotland: { events: [] } }],
    [
      'a region that is not an object',
      { 'england-and-wales': 1, scotland: { events: [] }, 'northern-ireland': { events: [] } },
    ],
    [
      'events that are not a list',
      {
        'england-and-wales': { events: {} },
        scotland: { events: [] },
        'northern-ireland': { events: [] },
      },
    ],
    [
      'no events',
      {
        'england-and-wales': { events: [] },
        scotland: { events: [] },
        'northern-ireland': { events: [] },
      },
    ],
    [
      'an event that is not an object',
      {
        'england-and-wales': { events: ['x'] },
        scotland: { events: [] },
        'northern-ireland': { events: [] },
      },
    ],
    [
      'a bad date',
      {
        'england-and-wales': { events: [{ date: '2026-02-30' }] },
        scotland: { events: [{ date: '2026-01-01' }] },
        'northern-ireland': { events: [{ date: '2026-01-01' }] },
      },
    ],
  ])('refuses %s', (_name, input) => {
    expect(() => parseGovUkFeed(input)).toThrow(TypeError);
  });
});
