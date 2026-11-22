/**
 * Common UK bills for step 3 of setup (docs/PLAN.md, Differentiator 2). Names only: the user
 * types their own amount and day, so nothing here goes out of date.
 */
export interface BillPreset {
  key: string;
  label: string;
  /** Council tax defaults to 10 instalments, April to January. */
  schedule: 'monthly' | 'councilTax';
}

export const BILL_PRESETS: readonly BillPreset[] = [
  { key: 'rent', label: 'Rent or mortgage', schedule: 'monthly' },
  { key: 'councilTax', label: 'Council tax', schedule: 'councilTax' },
  { key: 'energy', label: 'Energy', schedule: 'monthly' },
  { key: 'water', label: 'Water', schedule: 'monthly' },
  { key: 'broadband', label: 'Broadband', schedule: 'monthly' },
  { key: 'mobile', label: 'Mobile', schedule: 'monthly' },
  { key: 'tvLicence', label: 'TV licence', schedule: 'monthly' },
  { key: 'carInsurance', label: 'Car insurance', schedule: 'monthly' },
  { key: 'streaming', label: 'Streaming', schedule: 'monthly' },
];

/** Starting categories for spends. The user can rename, add and remove them. */
export const DEFAULT_CATEGORIES: readonly { id: string; name: string }[] = [
  { id: 'groceries', name: 'Groceries' },
  { id: 'eating-out', name: 'Eating out' },
  { id: 'transport', name: 'Transport' },
  { id: 'shopping', name: 'Shopping' },
  { id: 'fun', name: 'Fun' },
  { id: 'household', name: 'Household' },
  { id: 'other', name: 'Other' },
];
