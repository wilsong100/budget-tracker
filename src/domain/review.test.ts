import { describe, expect, it } from 'vitest';
import { monthReview } from './review';

const categories = [
  { id: 'groceries', name: 'Groceries', planned: 30000 },
  { id: 'eating-out', name: 'Eating out', planned: 5000 },
  { id: 'fun', name: 'Fun', planned: null },
  { id: 'other', name: 'Other', planned: null },
];

describe('monthReview', () => {
  it('compares planned with actual spending by category, for that month only', () => {
    const review = monthReview('2026-11', categories, [
      { amount: 2340, date: '2026-11-20', category: 'groceries' },
      { amount: 1000, date: '2026-11-01', category: 'groceries' },
      { amount: 6200, date: '2026-11-30', category: 'eating-out' },
      { amount: 999, date: '2026-10-31', category: 'groceries' },
      { amount: 500, date: '2026-12-01', category: 'fun' },
      { amount: 1500, date: '2026-11-03', category: 'fun' },
    ]);
    expect(review.rows).toEqual([
      { id: 'groceries', name: 'Groceries', planned: 30000, actual: 3340, left: 26660 },
      { id: 'eating-out', name: 'Eating out', planned: 5000, actual: 6200, left: -1200 },
      { id: 'fun', name: 'Fun', planned: null, actual: 1500, left: null },
    ]);
    expect(review.totals).toEqual({ planned: 35000, actual: 11040, plannedActual: 9540 });
    expect(review.count).toBe(4);
  });

  it('keeps a planned category with no spending, and drops one with neither', () => {
    const review = monthReview('2026-11', categories, []);
    expect(review.rows.map((r) => [r.id, r.actual, r.left])).toEqual([
      ['groceries', 0, 30000],
      ['eating-out', 0, 5000],
    ]);
    expect(review.count).toBe(0);
  });

  it('gathers spends with no category, or a deleted one, under Not sorted', () => {
    const review = monthReview('2026-11', categories, [
      { amount: 250, date: '2026-11-02', category: null },
      { amount: 750, date: '2026-11-04', category: 'gone' },
    ]);
    expect(review.rows.at(-1)).toEqual({
      id: null,
      name: 'Not sorted',
      planned: null,
      actual: 1000,
      left: null,
    });
    expect(review.totals.actual).toBe(1000);
    // Unplanned money doesn't count against the plan.
    expect(review.totals.plannedActual).toBe(0);
  });

  it('is empty with no categories and no spends', () => {
    expect(monthReview('2026-11', [], [])).toEqual({
      rows: [],
      totals: { planned: 0, actual: 0, plannedActual: 0 },
      count: 0,
    });
  });

  it('refuses a month key that isn’t one', () => {
    expect(() => monthReview('2026-1', [], [])).toThrow(RangeError);
  });
});
