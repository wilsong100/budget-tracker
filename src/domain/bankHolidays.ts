import feed from './data/bank-holidays.json';
import { addDays, isIsoDate, isWeekend, type IsoDate } from './dates';

/**
 * UK bank holidays from the GOV.UK feed (https://www.gov.uk/bank-holidays.json).
 * A copy is bundled for offline use; the app refreshes it when online and passes the
 * newer copy through parseGovUkFeed. Dates after the feed ends count as normal days.
 */
export const REGIONS = ['england-and-wales', 'scotland', 'northern-ireland'] as const;
export type Region = (typeof REGIONS)[number];

export interface BankHolidays {
  region: Region;
  dates: ReadonlySet<IsoDate>;
  /** The years the feed covers. Outside them only weekends are known. */
  firstYear: number;
  lastYear: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads and checks the GOV.UK feed. Throws TypeError if it isn't in the expected shape. */
export function parseGovUkFeed(json: unknown): Record<Region, BankHolidays> {
  if (!isObject(json)) throw new TypeError('bank holiday feed must be an object');
  const result = {} as Record<Region, BankHolidays>;
  for (const region of REGIONS) {
    const division = json[region];
    if (!isObject(division)) throw new TypeError(`bank holiday feed has no ${region}`);
    const events = division['events'];
    if (!Array.isArray(events) || events.length === 0) {
      throw new TypeError(`bank holiday feed has no events for ${region}`);
    }
    const dates = new Set<IsoDate>();
    for (const event of events) {
      const date = isObject(event) ? event['date'] : undefined;
      if (!isIsoDate(date)) throw new TypeError(`bank holiday feed has a bad date in ${region}`);
      dates.add(date);
    }
    const sorted = [...dates].sort();
    result[region] = {
      region,
      dates,
      firstYear: Number(sorted[0]!.slice(0, 4)),
      lastYear: Number(sorted.at(-1)!.slice(0, 4)),
    };
  }
  return result;
}

let bundled: Record<Region, BankHolidays> | undefined;

/** The copy of the feed shipped with the app. */
export function bundledBankHolidays(region: Region): BankHolidays {
  bundled ??= parseGovUkFeed(feed);
  return bundled[region];
}

export function isBankHoliday(date: IsoDate, holidays: BankHolidays): boolean {
  return holidays.dates.has(date);
}

export function isWorkingDay(date: IsoDate, holidays: BankHolidays): boolean {
  return !isWeekend(date) && !isBankHoliday(date, holidays);
}

/** The date itself if it's a working day, otherwise the working day before it. */
export function workingDayOnOrBefore(date: IsoDate, holidays: BankHolidays): IsoDate {
  let day = date;
  while (!isWorkingDay(day, holidays)) day = addDays(day, -1);
  return day;
}

/** The date itself if it's a working day, otherwise the working day after it. */
export function workingDayOnOrAfter(date: IsoDate, holidays: BankHolidays): IsoDate {
  let day = date;
  while (!isWorkingDay(day, holidays)) day = addDays(day, 1);
  return day;
}
