import { describe, expect, it } from 'vitest';
import { UUID_PATTERN, uuidv7 } from './uuid';

const zeros = (n: number) => new Uint8Array(n);
const ones = (n: number) => new Uint8Array(n).fill(0xff);

describe('uuidv7', () => {
  it('puts the time first, then the version and variant', () => {
    expect(uuidv7(0x0193_4f2a_b3c1, zeros)).toBe('01934f2a-b3c1-7000-8000-000000000000');
    expect(uuidv7(0x0193_4f2a_b3c1, ones)).toBe('01934f2a-b3c1-7fff-bfff-ffffffffffff');
  });

  it('sorts by time', () => {
    const ids = [3, 1, 2].map((t) => uuidv7(1_763_700_000_000 + t));
    expect([...ids].sort()).toEqual([ids[1], ids[2], ids[0]]);
  });

  it('is random after the time, using crypto by default', () => {
    const a = uuidv7(1_763_700_000_000);
    const b = uuidv7(1_763_700_000_000);
    expect(a).toMatch(UUID_PATTERN);
    expect(a.slice(0, 13)).toBe(b.slice(0, 13));
    expect(a).not.toBe(b);
  });

  it('refuses times it cannot encode', () => {
    expect(() => uuidv7(-1)).toThrow(RangeError);
    expect(() => uuidv7(2 ** 48)).toThrow(RangeError);
    expect(() => uuidv7(1.5)).toThrow(RangeError);
  });
});
