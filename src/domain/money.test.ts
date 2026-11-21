import { describe, expect, it } from 'vitest';
import { assertPence, formatPence, isPence, mulDivRound, parsePounds, sumPence } from './money';

describe('parsePounds', () => {
  it.each([
    ['3.40', 340],
    ['3.4', 340],
    ['3', 300],
    ['0.05', 5],
    ['.5', 50],
    ['£12', 1200],
    [' £ 12.99 ', 1299],
    ['1,234.56', 123456],
    ['£1,234,567.89', 123456789],
    ['-3.40', -340],
    ['−3.40', -340],
    ['-£3.40', -340],
    ['0', 0],
    ['007.10', 710],
  ])('reads %j as %i pence', (input, expected) => {
    expect(parsePounds(input)).toBe(expected);
  });

  it.each([
    '',
    ' ',
    '£',
    'abc',
    '3.401',
    '3.',
    '1,23.00',
    '12,3456',
    '3..4',
    '1e3',
    '--3',
    '£-3',
    '3 40',
    '.',
  ])('refuses %j', (input) => {
    expect(parsePounds(input)).toBeNull();
  });

  it('refuses amounts too large to hold exactly', () => {
    expect(parsePounds('99999999999999999')).toBeNull();
  });

  it('never goes through floating point', () => {
    // 0.1 + 0.2 style errors: 1.15 * 100 is 114.99999999999999 in floats.
    expect(parsePounds('1.15')).toBe(115);
    expect(parsePounds('4.35')).toBe(435);
  });
});

describe('formatPence', () => {
  it.each([
    [0, '£0.00'],
    [5, '£0.05'],
    [340, '£3.40'],
    [123456, '£1,234.56'],
    [100000000, '£1,000,000.00'],
    [-340, '−£3.40'],
    [-5, '−£0.05'],
  ])('shows %i pence as %s', (pence, expected) => {
    expect(formatPence(pence)).toBe(expected);
  });

  it('can always show a sign, for breakdown lines', () => {
    expect(formatPence(340, { sign: 'always' })).toBe('+£3.40');
    expect(formatPence(-340, { sign: 'always' })).toBe('−£3.40');
    expect(formatPence(0, { sign: 'always' })).toBe('£0.00');
  });

  it('round-trips with parsePounds', () => {
    for (const p of [0, 1, 99, 100, 101, 123456, -98765]) {
      expect(parsePounds(formatPence(p))).toBe(p);
    }
  });

  it('refuses non-integer pence', () => {
    expect(() => formatPence(3.4)).toThrow(RangeError);
  });
});

describe('isPence and assertPence', () => {
  it('accepts safe integers only', () => {
    expect(isPence(0)).toBe(true);
    expect(isPence(-12)).toBe(true);
    expect(isPence(1.5)).toBe(false);
    expect(isPence(Number.NaN)).toBe(false);
    expect(isPence(2 ** 53)).toBe(false);
    expect(isPence('12')).toBe(false);
  });

  it('throws with the name of the bad value', () => {
    expect(() => assertPence(1.5, 'balance')).toThrow('balance must be a whole number of pence');
    expect(() => assertPence(1.5)).toThrow('amount must be');
    expect(() => assertPence(12)).not.toThrow();
  });
});

describe('mulDivRound', () => {
  it.each([
    [1000, 1, 3, 333],
    [1000, 2, 3, 667],
    [5, 1, 2, 3], // half rounds away from zero
    [-5, 1, 2, -3],
    [-1000, 2, 3, -667],
    [0, 7, 9, 0],
    [123456789, 2490, 120000, 2561728], // monthly interest at 24.9% APR
  ])('%i × %i ÷ %i = %i', (value, num, den, expected) => {
    expect(mulDivRound(value, num, den)).toBe(expected);
  });

  it('is exact where floats would not be', () => {
    // 9e15 × 3 overflows safe integers before the divide.
    expect(mulDivRound(3_000_000_000_000_000, 3, 3)).toBe(3_000_000_000_000_000);
  });

  it('refuses a zero or negative divisor and non-integers', () => {
    expect(() => mulDivRound(10, 1, 0)).toThrow(RangeError);
    expect(() => mulDivRound(10, 1, -2)).toThrow(RangeError);
    expect(() => mulDivRound(1.5, 1, 2)).toThrow(RangeError);
    expect(() => mulDivRound(10, 1.5, 2)).toThrow(RangeError);
    expect(() => mulDivRound(10, 1, 2.5)).toThrow(RangeError);
  });

  it('refuses a result too large to hold exactly', () => {
    expect(() => mulDivRound(Number.MAX_SAFE_INTEGER, 2, 1)).toThrow(RangeError);
  });
});

describe('sumPence', () => {
  it('adds a list of pence', () => {
    expect(sumPence([])).toBe(0);
    expect(sumPence([340, 1299, -100])).toBe(1539);
  });

  it('refuses floats and overflow', () => {
    expect(() => sumPence([1, 0.5])).toThrow(RangeError);
    expect(() => sumPence([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
  });
});
