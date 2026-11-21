import { describe, expect, it } from 'vitest';
import { decodeHlc, encodeHlc, hlcWall, isHlc, receiveHlc, tickHlc } from './hlc';

const T = 1_763_700_000_000;

describe('encoding', () => {
  it('round-trips and sorts in time order', () => {
    const a = encodeHlc({ wall: T, counter: 0, node: 'phone' });
    const b = encodeHlc({ wall: T, counter: 1, node: 'laptop' });
    const c = encodeHlc({ wall: T + 1, counter: 0, node: 'a' });
    expect(a).toBe('001763700000000:000000:phone');
    expect(decodeHlc(b)).toEqual({ wall: T, counter: 1, node: 'laptop' });
    expect([c, b, a].sort()).toEqual([a, b, c]);
    expect(hlcWall(c)).toBe(T + 1);
  });

  it('refuses values it cannot encode', () => {
    expect(() => encodeHlc({ wall: -1, counter: 0, node: 'n' })).toThrow(RangeError);
    expect(() => encodeHlc({ wall: 1.5, counter: 0, node: 'n' })).toThrow(RangeError);
    expect(() => encodeHlc({ wall: 10 ** 15, counter: 0, node: 'n' })).toThrow(RangeError);
    expect(() => encodeHlc({ wall: T, counter: 1_000_000, node: 'n' })).toThrow(RangeError);
    expect(() => encodeHlc({ wall: T, counter: -1, node: 'n' })).toThrow(RangeError);
    expect(() => encodeHlc({ wall: T, counter: 0, node: '' })).toThrow(RangeError);
    expect(() => encodeHlc({ wall: T, counter: 0, node: 'a:b' })).toThrow(RangeError);
  });

  it('refuses text that is not a timestamp', () => {
    for (const text of [
      '',
      'abc',
      '1763700000000:0:x',
      '001763700000000:000000:',
      '001763700000000:000000:a:b',
    ]) {
      expect(isHlc(text)).toBe(false);
      expect(() => decodeHlc(text)).toThrow(RangeError);
    }
    expect(isHlc(42)).toBe(false);
    expect(isHlc('001763700000000:000000:x')).toBe(true);
  });
});

describe('tickHlc', () => {
  it('follows the wall clock', () => {
    expect(tickHlc(null, T, 'a')).toEqual({ wall: T, counter: 0, node: 'a' });
    expect(tickHlc({ wall: T, counter: 0, node: 'a' }, T + 5, 'a')).toEqual({
      wall: T + 5,
      counter: 0,
      node: 'a',
    });
  });

  it('counts up within one millisecond', () => {
    expect(tickHlc({ wall: T, counter: 4, node: 'a' }, T, 'a')).toEqual({
      wall: T,
      counter: 5,
      node: 'a',
    });
  });

  it('never goes backwards when the device clock does', () => {
    const next = tickHlc({ wall: T, counter: 2, node: 'a' }, T - 60_000, 'a');
    expect(next).toEqual({ wall: T, counter: 3, node: 'a' });
  });
});

describe('receiveHlc', () => {
  it('jumps ahead of a remote timestamp from the future', () => {
    expect(
      receiveHlc(
        { wall: T, counter: 0, node: 'a' },
        { wall: T + 100, counter: 7, node: 'b' },
        T,
        'a',
      ),
    ).toEqual({
      wall: T + 100,
      counter: 8,
      node: 'a',
    });
  });

  it('uses the local clock when it is ahead of both', () => {
    expect(
      receiveHlc(
        { wall: T, counter: 3, node: 'a' },
        { wall: T, counter: 9, node: 'b' },
        T + 1,
        'a',
      ),
    ).toEqual({
      wall: T + 1,
      counter: 0,
      node: 'a',
    });
  });

  it('counts past both when all three agree', () => {
    expect(
      receiveHlc({ wall: T, counter: 3, node: 'a' }, { wall: T, counter: 9, node: 'b' }, T, 'a'),
    ).toEqual({
      wall: T,
      counter: 10,
      node: 'a',
    });
  });

  it('counts past its own clock when the remote is behind', () => {
    expect(
      receiveHlc(
        { wall: T, counter: 3, node: 'a' },
        { wall: T - 5, counter: 9, node: 'b' },
        T - 10,
        'a',
      ),
    ).toEqual({
      wall: T,
      counter: 4,
      node: 'a',
    });
  });

  it('works with no local history', () => {
    expect(receiveHlc(null, { wall: T, counter: 2, node: 'b' }, T - 1, 'a')).toEqual({
      wall: T,
      counter: 3,
      node: 'a',
    });
  });

  it('always moves past both inputs', () => {
    const last = { wall: T, counter: 1, node: 'a' };
    const remote = { wall: T + 3, counter: 0, node: 'b' };
    const next = encodeHlc(receiveHlc(last, remote, T + 2, 'a'));
    expect(next > encodeHlc(last)).toBe(true);
    expect(next > encodeHlc(remote)).toBe(true);
  });
});
