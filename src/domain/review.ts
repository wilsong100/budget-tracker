import { monthStart, monthKey, type IsoDate, type MonthKey } from './dates';
import { sumPence, type Pence } from './money';

export interface ReviewCategory {
  id: string;
  name: string;
  /** What the user plans to spend in a month, or null for no plan. */
  planned: Pence | null;
}

export interface ReviewSpend {
  amount: Pence;
  date: IsoDate;
  category: string | null;
}

export interface ReviewRow {
  /** Null for spends with no category, or one that's since been removed. */
  id: string | null;
  name: string;
  planned: Pence | null;
  actual: Pence;
  /** planned − actual: negative when over. Null with no plan. */
  left: Pence | null;
}

export interface MonthReview {
  /** Categories in the order given, then "Not sorted". Ones with no plan and no spending are left out. */
  rows: ReviewRow[];
  totals: {
    planned: Pence;
    actual: Pence;
    /** Spending in categories that have a plan, to set against `planned`. */
    plannedActual: Pence;
  };
  /** Spends logged in the month. */
  count: number;
}

export const NOT_SORTED = 'Not sorted';

/** Month review: planned against actual spending, by category, for one calendar month. */
export function monthReview(
  month: MonthKey,
  categories: readonly ReviewCategory[],
  spends: readonly ReviewSpend[],
): MonthReview {
  monthStart(month);
  const inMonth = spends.filter((s) => monthKey(s.date) === month);
  const known = new Set(categories.map((c) => c.id));
  const spentIn = (match: (s: ReviewSpend) => boolean) =>
    sumPence(inMonth.filter(match).map((s) => s.amount));

  const rows: ReviewRow[] = categories.map((c) => {
    const actual = spentIn((s) => s.category === c.id);
    return {
      id: c.id,
      name: c.name,
      planned: c.planned,
      actual,
      left: c.planned === null ? null : c.planned - actual,
    };
  });
  const unsorted = spentIn((s) => s.category === null || !known.has(s.category));
  if (unsorted > 0) {
    rows.push({ id: null, name: NOT_SORTED, planned: null, actual: unsorted, left: null });
  }
  const shown = rows.filter((r) => r.planned !== null || r.actual > 0);
  const planned = shown.filter((r) => r.planned !== null);
  return {
    rows: shown,
    totals: {
      planned: sumPence(planned.map((r) => r.planned!)),
      actual: sumPence(shown.map((r) => r.actual)),
      plannedActual: sumPence(planned.map((r) => r.actual)),
    },
    count: inMonth.length,
  };
}
