import { describe, expect, it } from 'vitest';
import { aprFrom, aprText } from './forms';

describe('aprFrom', () => {
  it.each([
    ['24.9', 2490],
    ['24.9%', 2490],
    [' 24.95 % ', 2495],
    ['0', 0],
    ['7', 700],
    ['100', 10000],
    ['0.05', 5],
  ])('reads %s as %i basis points', (text, points) => {
    expect(aprFrom(text)).toBe(points);
  });

  it.each(['', 'abc', '24.999', '-5', '100.01', '1,000', '.5'])('refuses %j', (text) => {
    expect(aprFrom(text)).toBeNull();
  });
});

describe('aprText', () => {
  it.each([
    [2490, '24.9'],
    [2495, '24.95'],
    [700, '7'],
    [0, '0'],
    [5, '0.05'],
  ])('shows %i as %s', (points, text) => {
    expect(aprText(points)).toBe(text);
  });
});
