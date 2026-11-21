import { dayOfWeek, parseIso, type IsoDate } from './dates';
import { parsePounds, type Pence } from './money';
import type { PayCycle } from './paydays';
import type { Recurrence } from './recurrence';

// en-GB wording for dates, schedules and quick spend logging. No Intl, so it's the same
// in every browser and in the offline file.

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 22nd, 23rd, 31st */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

/** "Fri 27 Nov" */
export function formatShortDate(date: IsoDate): string {
  const { month, day } = parseIso(date);
  return `${WEEKDAYS[dayOfWeek(date) - 1]} ${day} ${MONTHS[month - 1]}`;
}

/** "27 Nov 2026" */
export function formatMediumDate(date: IsoDate): string {
  const { year, month, day } = parseIso(date);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

const dayWords = (day: number | 'last') =>
  day === 'last' ? 'the last day' : `the ${ordinal(day)}`;

/** "Monthly on the 25th", "Every 4 weeks", "Council tax: 10 payments, April to January". */
export function describeRecurrence(rule: Recurrence): string {
  switch (rule.kind) {
    case 'once':
      return `Once, on ${formatMediumDate(rule.date)}`;
    case 'everyNWeeks':
      return rule.weeks === 1 ? 'Weekly' : rule.weeks === 2 ? 'Every 2 weeks' : 'Every 4 weeks';
    case 'everyNMonths': {
      const every = { 1: 'Monthly', 3: 'Every 3 months', 6: 'Every 6 months', 12: 'Yearly' }[
        rule.months
      ];
      if (rule.months === 12) {
        return `Yearly on ${rule.day === 'last' ? 'the last day of' : rule.day} ${
          MONTHS[parseIso(rule.anchor).month - 1]
        }`;
      }
      return `${every} on ${dayWords(rule.day)}`;
    }
    case 'councilTax':
      return rule.instalments === 10
        ? `10 payments, April to January, on ${dayWords(rule.day)}`
        : `12 payments, April to March, on ${dayWords(rule.day)}`;
  }
}

/** "Monthly on the 28th", "Last working day of the month", "Every 4 weeks". */
export function describePayCycle(cycle: PayCycle): string {
  switch (cycle.kind) {
    case 'monthly':
      return `Monthly on the ${ordinal(cycle.day)}`;
    case 'lastWorkingDay':
      return 'Last working day of the month';
    case 'fourWeekly':
      return 'Every 4 weeks';
    case 'fortnightly':
      return 'Every 2 weeks';
    case 'weekly':
      return 'Weekly';
  }
}

export interface QuickSpend {
  /** Empty when only an amount was typed. */
  label: string;
  amount: Pence;
}

/** Reads one line like "coffee 3.40", "£12 lunch" or "4.50". Null if there's no amount. */
export function parseQuickSpend(input: string): QuickSpend | null {
  const words = input.trim().split(/\s+/).filter(Boolean);
  const tryAt = (index: number): QuickSpend | null => {
    const amount = parsePounds(words[index] ?? '');
    if (amount === null || amount <= 0) return null;
    return { label: words.filter((_, i) => i !== index).join(' '), amount };
  };
  return tryAt(words.length - 1) ?? tryAt(0);
}

export interface CategorisedSpend {
  label: string;
  category: string | null;
  at: number;
}

const normalise = (label: string) => label.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Suggests a category from earlier spends: the latest spend with the same label, or failing
 * that the latest whose first word matches. Null when there's nothing to go on.
 */
export function suggestCategory(
  label: string,
  history: readonly CategorisedSpend[],
): string | null {
  const wanted = normalise(label);
  if (wanted === '') return null;
  const latest = [...history]
    .filter((s): s is CategorisedSpend & { category: string } => s.category !== null)
    .sort((a, b) => b.at - a.at);
  const firstWord = (text: string) => text.split(' ')[0];
  return (
    latest.find((s) => normalise(s.label) === wanted)?.category ??
    latest.find((s) => firstWord(normalise(s.label)) === firstWord(wanted))?.category ??
    null
  );
}
