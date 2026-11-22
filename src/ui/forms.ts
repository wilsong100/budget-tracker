// Turning what the user typed into stored values. Shared by setup, Bills, Pots and Settings.
import {
  isIsoDate,
  nextPayday,
  parsePounds,
  bundledBankHolidays,
  type IsoDate,
  type PayCycle,
  type Payday,
  type Pence,
  type Recurrence,
  type Region,
} from '../domain';

export type CycleChoice = 'monthly' | 'lastWorkingDay' | 'fourWeekly' | 'fortnightly' | 'weekly';

export const CYCLE_CHOICES: [CycleChoice, string][] = [
  ['monthly', 'Monthly, on a date'],
  ['lastWorkingDay', 'Monthly, last working day'],
  ['fourWeekly', 'Every 4 weeks'],
  ['fortnightly', 'Every 2 weeks'],
  ['weekly', 'Weekly'],
];

/** A non-negative amount, or null. Blank counts as nothing typed. */
export function amountFrom(text: string): Pence | null {
  const pence = parsePounds(text);
  return pence === null || pence < 0 ? null : pence;
}

/** An amount that may be negative, like an overdrawn balance. */
export function balanceFrom(text: string): Pence | null {
  return parsePounds(text);
}

export function dayFrom(text: string): number | null {
  const day = Number(text.trim());
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

export function cycleFrom(choice: CycleChoice, day: string, date: string): PayCycle | null {
  if (choice === 'monthly') {
    const d = dayFrom(day);
    return d === null ? null : { kind: 'monthly', day: d };
  }
  if (choice === 'lastWorkingDay') return { kind: 'lastWorkingDay' };
  return isIsoDate(date) ? { kind: choice, anchor: date } : null;
}

export function nextPaydayFor(cycle: PayCycle, region: Region, today: IsoDate): Payday {
  return nextPayday({ cycle }, bundledBankHolidays(region), today);
}

export type BillSchedule =
  | 'weekly'
  | 'fortnightly'
  | 'fourWeekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'councilTax10'
  | 'councilTax12';

export const BILL_SCHEDULES: [BillSchedule, string][] = [
  ['monthly', 'Monthly'],
  ['weekly', 'Weekly'],
  ['fortnightly', 'Every 2 weeks'],
  ['fourWeekly', 'Every 4 weeks'],
  ['quarterly', 'Every 3 months'],
  ['yearly', 'Yearly'],
  ['councilTax10', 'Council tax: 10 payments (April to January)'],
  ['councilTax12', 'Council tax: 12 payments (April to March)'],
];

/** Whether a schedule is set by a day of the month (true) or by its next date (false). */
export const usesDayOfMonth = (s: BillSchedule) =>
  s === 'monthly' || s === 'councilTax10' || s === 'councilTax12';

export function ruleFrom(
  schedule: BillSchedule,
  day: string,
  date: string,
  today: IsoDate,
): Recurrence | null {
  if (usesDayOfMonth(schedule)) {
    const d = dayFrom(day);
    if (d === null) return null;
    if (schedule === 'monthly') return { kind: 'everyNMonths', months: 1, day: d, anchor: today };
    return { kind: 'councilTax', instalments: schedule === 'councilTax10' ? 10 : 12, day: d };
  }
  if (!isIsoDate(date)) return null;
  switch (schedule) {
    case 'weekly':
      return { kind: 'everyNWeeks', weeks: 1, anchor: date };
    case 'fortnightly':
      return { kind: 'everyNWeeks', weeks: 2, anchor: date };
    case 'fourWeekly':
      return { kind: 'everyNWeeks', weeks: 4, anchor: date };
    case 'quarterly':
      return { kind: 'everyNMonths', months: 3, day: Number(date.slice(8)), anchor: date };
    default:
      return { kind: 'everyNMonths', months: 12, day: Number(date.slice(8)), anchor: date };
  }
}

/** The form fields that would give this rule back, for editing. */
export function scheduleOf(rule: Recurrence): {
  schedule: BillSchedule;
  day: string;
  date: string;
} {
  switch (rule.kind) {
    case 'everyNWeeks':
      return {
        schedule: rule.weeks === 1 ? 'weekly' : rule.weeks === 2 ? 'fortnightly' : 'fourWeekly',
        day: '',
        date: rule.anchor,
      };
    case 'everyNMonths':
      if (rule.months === 1) {
        return {
          schedule: 'monthly',
          day: rule.day === 'last' ? '31' : String(rule.day),
          date: '',
        };
      }
      return { schedule: rule.months === 12 ? 'yearly' : 'quarterly', day: '', date: rule.anchor };
    case 'councilTax':
      return {
        schedule: rule.instalments === 10 ? 'councilTax10' : 'councilTax12',
        day: rule.day === 'last' ? '31' : String(rule.day),
        date: '',
      };
    case 'once':
      return { schedule: 'monthly', day: rule.date.slice(8), date: '' };
  }
}

/** Shows pence in an input box: 123456 → "1234.56", 0 → "". */
export function poundsText(pence: Pence | null): string {
  if (pence === null || pence === 0) return '';
  const sign = pence < 0 ? '-' : '';
  const whole = Math.trunc(Math.abs(pence) / 100);
  const part = Math.abs(pence) % 100;
  return part === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(part).padStart(2, '0')}`;
}
