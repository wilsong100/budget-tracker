import { describe, expect, it } from 'vitest';
import { BILL_PRESETS, DEFAULT_CATEGORIES } from './presets';

describe('presets', () => {
  it('offers the common UK bills from docs/PLAN.md, council tax in 10 instalments', () => {
    expect(BILL_PRESETS.map((p) => p.label)).toEqual([
      'Rent or mortgage',
      'Council tax',
      'Energy',
      'Water',
      'Broadband',
      'Mobile',
      'TV licence',
      'Car insurance',
      'Streaming',
    ]);
    expect(BILL_PRESETS.find((p) => p.key === 'councilTax')?.schedule).toBe('councilTax');
  });

  it('has unique keys and category ids', () => {
    expect(new Set(BILL_PRESETS.map((p) => p.key)).size).toBe(BILL_PRESETS.length);
    expect(new Set(DEFAULT_CATEGORIES.map((c) => c.id)).size).toBe(DEFAULT_CATEGORIES.length);
  });
});
