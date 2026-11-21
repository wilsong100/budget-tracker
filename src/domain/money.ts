/** Money is always a whole number of pence. Never use floats for money. */
export type Pence = number;

const MINUS = '−'; // typographic minus sign, as used on screen

export function isPence(value: unknown): value is Pence {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function assertPence(value: unknown, what = 'amount'): asserts value is Pence {
  if (!isPence(value)) {
    throw new RangeError(`${what} must be a whole number of pence, got ${String(value)}`);
  }
}

export function assertNonNegativePence(value: unknown, what = 'amount'): asserts value is Pence {
  assertPence(value, what);
  if (value < 0) throw new RangeError(`${what} must not be negative, got ${value}`);
}

const AMOUNT = /^([-−])?\s*£?\s*(?:(\d{1,3}(?:,\d{3})+)|(\d*))(?:\.(\d{1,2}))?$/;

/**
 * Reads an amount typed in pounds ("3.40", "£1,234.56", "-3.40") as pence.
 * Returns null for anything that isn't a clear amount. Works on the digits, never on floats.
 */
export function parsePounds(input: string): Pence | null {
  const match = AMOUNT.exec(input.trim());
  if (!match) return null;
  const [, sign, grouped, plain, fraction] = match;
  // Exactly one of the two groups matches; `plain` may be the empty string.
  const whole = (grouped ?? plain)!.replaceAll(',', '');
  if (whole === '' && fraction === undefined) return null;
  const pence = BigInt(whole === '' ? '0' : whole) * 100n + BigInt((fraction ?? '').padEnd(2, '0'));
  const signed = sign ? -pence : pence;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    return null;
  }
  return Number(signed) || 0; // turn -0 into 0
}

export interface FormatOptions {
  /** 'always' puts a + on positive amounts, for breakdown lines. */
  sign?: 'auto' | 'always';
}

/** Shows pence as pounds the UK way: £1,234.56, −£3.40. */
export function formatPence(pence: Pence, options: FormatOptions = {}): string {
  assertPence(pence);
  const absolute = Math.abs(pence);
  const pounds = String(Math.trunc(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = `£${pounds}.${String(absolute % 100).padStart(2, '0')}`;
  if (pence < 0) return MINUS + body;
  if (pence > 0 && options.sign === 'always') return '+' + body;
  return body;
}

/**
 * value × numerator ÷ denominator, exactly, rounded half away from zero.
 * Used for interest: mulDivRound(balance, aprBasisPoints, 12 * 10_000).
 */
export function mulDivRound(value: number, numerator: number, denominator: number): number {
  for (const [name, n] of [
    ['value', value],
    ['numerator', numerator],
    ['denominator', denominator],
  ] as const) {
    if (!Number.isSafeInteger(n)) throw new RangeError(`${name} must be a safe integer, got ${n}`);
  }
  if (denominator <= 0) throw new RangeError('denominator must be positive');
  const product = BigInt(value) * BigInt(numerator);
  const divisor = BigInt(denominator);
  let quotient = product / divisor;
  const remainder = product % divisor;
  const absRemainder = remainder < 0n ? -remainder : remainder;
  if (absRemainder * 2n >= divisor) quotient += product < 0n ? -1n : 1n;
  const result = Number(quotient);
  if (!Number.isSafeInteger(result)) throw new RangeError('result is too large to hold exactly');
  return result || 0;
}

/** Adds pence, refusing floats and results too large to hold exactly. */
export function sumPence(amounts: readonly Pence[]): Pence {
  let total = 0;
  for (const amount of amounts) {
    assertPence(amount);
    total += amount;
    assertPence(total, 'total');
  }
  return total;
}
