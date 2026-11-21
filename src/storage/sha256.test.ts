import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './sha256';

describe('sha256Hex', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ])('matches the published test vector for %j', (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
  });

  it('matches Node’s crypto for every length around the block boundaries, and for UTF-8', () => {
    for (let length = 0; length < 200; length++) {
      const input = 'x£'.repeat(length).slice(0, length);
      expect(sha256Hex(input)).toBe(createHash('sha256').update(input, 'utf8').digest('hex'));
    }
    const long = JSON.stringify(
      Array.from({ length: 5000 }, (_, i) => ({ i, note: `coffee ${i} £3.40` })),
    );
    expect(sha256Hex(long)).toBe(createHash('sha256').update(long, 'utf8').digest('hex'));
  });
});
