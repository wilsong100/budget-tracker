import { describe, expect, it } from 'vitest';
import { buildTarget, canSync } from './build-target';

describe('buildTarget', () => {
  it('treats the offline mode as the offline build', () => {
    expect(buildTarget('offline')).toBe('offline');
  });

  it.each(['web', 'development', 'test', 'production'])('treats %s as the web build', (mode) => {
    expect(buildTarget(mode)).toBe('web');
  });
});

describe('canSync', () => {
  it('allows sync only in the web build', () => {
    expect(canSync('web')).toBe(true);
    expect(canSync('offline')).toBe(false);
  });
});
