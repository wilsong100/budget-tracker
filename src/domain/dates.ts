/**
 * Calendar dates as ISO 'YYYY-MM-DD' strings in UK time.
 *
 * All arithmetic goes through day numbers (days since 1970-01-01), so there are no time
 * zones, no BST off-by-one days and no Date getters. The only clock-aware function is
 * todayInLondon, which turns an instant into the calendar day in Europe/London.
 */
export type IsoDate = string;

/** Month as 'YYYY-MM'. */
export type MonthKey = string;

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function daysInMonth(year: number, month: number): number {
  const days = MONTH_DAYS[month - 1];
  if (days === undefined) throw new RangeError(`month must be 1–12, got ${month}`);
  return month === 2 && isLeapYear(year) ? 29 : days;
}

function validParts(year: number, month: number, day: number): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    year >= 0 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const match = ISO.exec(value);
  return match !== null && validParts(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function parseIso(date: IsoDate): DateParts {
  if (!isIsoDate(date)) throw new RangeError(`not a valid ISO date: ${JSON.stringify(date)}`);
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

export function isoDate(year: number, month: number, day: number): IsoDate {
  if (!validParts(year, month, day))
    throw new RangeError(`not a valid date: ${year}-${month}-${day}`);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Day-number conversion after Howard Hinnant's civil-date algorithms.
export function toDayNumber(date: IsoDate): number {
  const { year, month, day } = parseIso(date);
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const shiftedMonth = (month + 9) % 12;
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

export function fromDayNumber(dayNumber: number): IsoDate {
  if (!Number.isInteger(dayNumber))
    throw new RangeError(`day number must be an integer, got ${dayNumber}`);
  const z = dayNumber + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return isoDate(year, month, day);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** a − b in days. */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** 1 = Monday … 7 = Sunday (ISO 8601). 1970-01-01 was a Thursday. */
export function dayOfWeek(date: IsoDate): number {
  return ((((toDayNumber(date) + 3) % 7) + 7) % 7) + 1;
}

export function isWeekend(date: IsoDate): boolean {
  return dayOfWeek(date) >= 6;
}

/** The given day of a month, moved back to the month's end if the month is shorter. */
export function dateInMonth(year: number, month: number, day: number | 'last'): IsoDate {
  const last = daysInMonth(year, month);
  if (day === 'last') return isoDate(year, month, last);
  if (!Number.isInteger(day) || day < 1 || day > 31)
    throw new RangeError(`day must be 1–31 or 'last', got ${day}`);
  return isoDate(year, month, Math.min(day, last));
}

/** Months since year 0, so months can be counted and stepped like numbers. */
export function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

export function fromMonthIndex(index: number): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

/** Adds calendar months, keeping the day of the month where it can (31 Jan + 1 month = 28 Feb). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parseIso(date);
  const target = fromMonthIndex(monthIndex(year, month) + months);
  return dateInMonth(target.year, target.month, day);
}

export function monthKey(date: IsoDate): MonthKey {
  parseIso(date);
  return date.slice(0, 7);
}

/** The first day of a month key ("2026-11" → "2026-11-01"). Throws if it isn't a month. */
export function monthStart(month: MonthKey): IsoDate {
  if (!/^\d{4}-\d{2}$/.test(month) || !isIsoDate(`${month}-01`)) {
    throw new RangeError(`not a month: ${month}`);
  }
  return `${month}-01`;
}

/** The last day of a month key. */
export function monthEnd(month: MonthKey): IsoDate {
  const { year, month: m } = parseIso(monthStart(month));
  return dateInMonth(year, m, 'last');
}

/** Calendar months from a's month to b's month (b − a). */
export function monthsBetween(a: IsoDate, b: IsoDate): number {
  const from = parseIso(a);
  const to = parseIso(b);
  return monthIndex(to.year, to.month) - monthIndex(from.year, from.month);
}

/** Sort comparator for ISO dates. */
export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

/** dd/mm/yyyy */
export function formatUkDate(date: IsoDate): string {
  const { year, month, day } = parseIso(date);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

const UK = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** Reads dd/mm/yyyy (or d/m/yyyy). Returns null for anything else or an impossible date. */
export function parseUkDate(input: string): IsoDate | null {
  const match = UK.exec(input.trim());
  if (!match) return null;
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return validParts(year, month, day) ? isoDate(year, month, day) : null;
}

const londonDay = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The calendar day in London at a given instant, allowing for BST. */
export function todayInLondon(instant: Date | number): IsoDate {
  const time = typeof instant === 'number' ? instant : instant.valueOf();
  if (!Number.isFinite(time)) throw new RangeError('not a valid instant');
  const parts = londonDay.formatToParts(time);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return isoDate(part('year'), part('month'), part('day'));
}
