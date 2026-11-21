import { describe, expect, it } from 'vitest';
import { canonicalJson, isJson } from './canonicalJson';

describe('canonicalJson', () => {
  it('sorts keys at every depth', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}',
    );
  });

  it('gives the same text whatever order keys were added in', () => {
    expect(canonicalJson({ x: 1, y: 2 })).toBe(canonicalJson({ y: 2, x: 1 }));
  });

  it('drops undefined object properties, like JSON.stringify', () => {
    expect(canonicalJson({ a: undefined, b: 'x' })).toBe('{"b":"x"}');
  });

  it('handles every JSON type and escaping', () => {
    expect(canonicalJson([true, false, null, -1.5, 'say "hi" £'])).toBe(
      '[true,false,null,-1.5,"say \\"hi\\" £"]',
    );
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Infinity],
    ['undefined in an array', [1, undefined]],
    ['a function', () => 1],
    ['a Date', new Date(0)],
    ['a Map', new Map()],
    ['undefined', undefined],
  ])('refuses %s', (_name, value) => {
    expect(() => canonicalJson(value)).toThrow(TypeError);
    expect(isJson(value)).toBe(false);
  });

  it('accepts plain data', () => {
    expect(isJson({ amount: 340, note: 'coffee' })).toBe(true);
  });
});
