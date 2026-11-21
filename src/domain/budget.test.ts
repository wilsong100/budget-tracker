import { describe, expect, it } from 'vitest';
import { bundledBankHolidays } from './bankHolidays';
import {
  budgetToday,
  nextBills,
  outgoingsSince,
  paidKeys,
  paidUntil,
  potSaved,
  projectBalance,
  type BudgetInput,
  type BudgetItem,
} from './budget';

const holidays = bundledBankHolidays('england-and-wales');

const energy: BudgetItem = {
  id: 'energy',
  label: 'Energy',
  kind: 'bill',
  amount: 9500,
  rule: { kind: 'everyNMonths', months: 1, day: 25, anchor: '2026-11-25' },
  paid: {},
};
const mobile: BudgetItem = {
  id: 'mobile',
  label: 'Mobile',
  kind: 'bill',
  amount: 2000,
  rule: { kind: 'everyNMonths', months: 1, day: 22, anchor: '2026-11-22' },
  paid: {},
};

/** Saturday 21 November 2026. Paid on the 28th, which is a Saturday, so the money comes on Fri 27th. */
function input(overrides: Partial<BudgetInput> = {}): BudgetInput {
  return {
    today: '2026-11-21',
    holidays,
    pay: { schedule: { cycle: { kind: 'monthly', day: 28 } }, amount: 200000 },
    balance: { amount: 123456, date: '2026-11-21', at: 1000 },
    items: [energy, mobile],
    spends: [],
    buffer: 0,
    overdraft: { include: false, limit: 0 },
    ...overrides,
  };
}

describe('budgetToday', () => {
  it('works out the day’s allowance from the balance, bills and payday', () => {
    const view = budgetToday(input());
    expect(view.nextPayday.date).toBe('2026-11-27');
    expect(view.nextPayday.moved).toBe(true);
    expect(view.daysUntilPayday).toBe(6);
    // 1,234.56 − 95 − 20 = 1,119.56, over 6 days, rounded down
    expect(view.safe.leftUntilPayday).toBe(111956);
    expect(view.allowance).toBe(18659);
    expect(view.leftToday).toBe(18659);
    expect(view.balance).toBe(123456);
    expect(view.upcoming.map((c) => c.key)).toEqual(['mobile:2026-11-22', 'energy:2026-11-25']);
  });

  it('takes today’s spends off what’s left today, not off the allowance', () => {
    const view = budgetToday(
      input({ spends: [{ id: 's1', label: 'coffee', amount: 340, date: '2026-11-21', at: 2000 }] }),
    );
    expect(view.allowance).toBe(18659);
    expect(view.spentToday).toBe(340);
    expect(view.leftToday).toBe(18319);
    expect(view.balance).toBe(123116);
  });

  it('spreads spending less today across the days left', () => {
    // The day after: nothing spent yesterday, so tomorrow's allowance is the same share.
    const day1 = budgetToday(
      input({ spends: [{ id: 's1', label: 'coffee', amount: 340, date: '2026-11-21', at: 2000 }] }),
    );
    const day2 = budgetToday(
      input({
        today: '2026-11-22',
        spends: [{ id: 's1', label: 'coffee', amount: 340, date: '2026-11-21', at: 2000 }],
      }),
    );
    // Spent £3.40 of £186.59, so the other £183.19 spreads over the 5 days left.
    expect(day2.daysUntilPayday).toBe(5);
    expect(day2.allowance).toBe(Math.floor((111956 - 340) / 5));
    expect(day2.allowance).toBeGreaterThan(day1.allowance);
  });

  it('shows an overspend as a negative amount left today', () => {
    const view = budgetToday(
      input({
        items: [],
        balance: { amount: 1000, date: '2026-11-21', at: 1000 },
        spends: [{ id: 's1', label: 'lunch', amount: 500, date: '2026-11-21', at: 2000 }],
      }),
    );
    expect(view.allowance).toBe(166);
    expect(view.leftToday).toBe(-334);
  });

  it('ignores spends from before the balance was last set', () => {
    const view = budgetToday(
      input({ spends: [{ id: 's1', label: 'coffee', amount: 340, date: '2026-11-21', at: 500 }] }),
    );
    expect(view.spentToday).toBe(0);
    expect(view.balance).toBe(123456);
  });

  it('gives the same number when a bill is ticked off as paid', () => {
    const ticked = budgetToday(
      input({ items: [energy, { ...mobile, paid: { '2026-11-22': 1500 } }] }),
    );
    expect(ticked.balance).toBe(121456);
    expect(ticked.upcoming.map((c) => c.key)).toEqual(['energy:2026-11-25']);
    expect(ticked.allowance).toBe(18659);
  });

  it('trusts a balance set after a bill was ticked off', () => {
    const view = budgetToday(
      input({ items: [energy, { ...mobile, paid: { '2026-11-22': 500 } }] }),
    );
    expect(view.balance).toBe(123456);
    expect(view.safe.leftUntilPayday).toBe(123456 - 9500);
    expect(view.allowance).toBe(18992);
  });

  it('counts the buffer and the overdraft', () => {
    const view = budgetToday(input({ buffer: 1956, overdraft: { include: true, limit: 50000 } }));
    expect(view.safe.leftUntilPayday).toBe(111956 - 1956 + 50000);
  });
});

describe('projectBalance', () => {
  it('adds pay that has arrived and takes off bills that have gone out', () => {
    // A week later: mobile (22nd) and energy (25th) have gone out, and pay came on the 27th.
    expect(projectBalance(input({ today: '2026-11-28' }))).toBe(123456 - 11500 + 200000);
  });

  it('counts pay on the day it arrives', () => {
    expect(projectBalance(input({ today: '2026-11-27' }))).toBe(123456 - 11500 + 200000);
  });

  it('assumes pay on the day the balance was set is already in it', () => {
    expect(
      projectBalance(
        input({ today: '2026-11-28', balance: { amount: 5000, date: '2026-11-27', at: 1000 } }),
      ),
    ).toBe(5000);
  });

  it('leaves out bills ticked off before the balance was set', () => {
    const items = [energy, { ...mobile, paid: { '2026-11-22': 500 } }];
    expect(projectBalance(input({ today: '2026-11-28', items }))).toBe(123456 - 9500 + 200000);
  });

  it('only counts a tick on a real date of the bill', () => {
    const items = [energy, { ...mobile, paid: { '2026-11-23': 1500 } }];
    expect(projectBalance(input({ items }))).toBe(123456);
  });

  it('copes with a balance dated after today', () => {
    expect(projectBalance(input({ today: '2026-11-20' }))).toBe(123456);
  });

  it('moves payday off the Boxing Day bank holiday', () => {
    const view = budgetToday(input({ today: '2026-11-28' }));
    // 28 December 2026 is the substitute Boxing Day holiday, so pay comes on Thursday 24th.
    expect(view.nextPayday.date).toBe('2026-12-24');
  });
});

describe('outgoingsSince', () => {
  it('is zero on the day the anchor was set', () => {
    expect(outgoingsSince(mobile, { amount: 0, date: '2026-11-22', at: 0 }, '2026-11-22')).toBe(0);
  });
});

describe('potSaved', () => {
  it('adds each saving that has gone into the pot since it was last set', () => {
    const pot: BudgetItem = {
      id: 'holiday',
      label: 'Holiday',
      kind: 'pot',
      amount: 2500,
      rule: { kind: 'everyNMonths', months: 1, day: 15, anchor: '2026-11-15' },
      paid: {},
    };
    expect(potSaved({ amount: 10000, date: '2026-11-01', at: 0 }, pot, '2026-12-20')).toBe(15000);
  });
});

describe('paidKeys', () => {
  it('lists every ticked occurrence', () => {
    expect([...paidKeys([{ ...mobile, paid: { '2026-11-22': 1 } }, energy])]).toEqual([
      'mobile:2026-11-22',
    ]);
  });
});

describe('nextBills', () => {
  it('gives the next few unpaid bills, past payday too', () => {
    const pot: BudgetItem = { ...energy, id: 'pot', kind: 'pot' };
    const bills = nextBills(
      [energy, { ...mobile, paid: { '2026-11-22': 1 } }, pot],
      '2026-11-21',
      3,
    );
    expect(bills.map((b) => b.key)).toEqual([
      'energy:2026-11-25',
      'mobile:2026-12-22',
      'energy:2026-12-25',
    ]);
  });
});

describe('paidUntil', () => {
  it('lists ticked occurrences from today to payday, in date order', () => {
    const items = [
      { ...energy, paid: { '2026-11-25': 1, '2026-10-25': 1, '2026-12-25': 1 } },
      { ...mobile, paid: { '2026-11-22': 1, '2026-11-23': 1 } },
    ];
    expect(paidUntil(items, '2026-11-21', '2026-11-27').map((c) => c.key)).toEqual([
      'mobile:2026-11-22',
      'energy:2026-11-25',
    ]);
  });
});
