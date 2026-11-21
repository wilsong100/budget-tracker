import { describe, expect, it } from 'vitest';
import { chooseBackupMethod } from './backupTargets';

describe('chooseBackupMethod', () => {
  it.each([
    [
      'Chrome or Edge on desktop',
      { hasSaveFilePicker: true, canShareFiles: false, isMobile: false },
      'linkedFile',
    ],
    [
      'Chrome on Android',
      { hasSaveFilePicker: false, canShareFiles: true, isMobile: true },
      'share',
    ],
    [
      'Safari on iPhone',
      { hasSaveFilePicker: false, canShareFiles: true, isMobile: true },
      'share',
    ],
    [
      'Safari on Mac (can share, but the plan says download)',
      { hasSaveFilePicker: false, canShareFiles: true, isMobile: false },
      'download',
    ],
    [
      'Firefox on desktop',
      { hasSaveFilePicker: false, canShareFiles: false, isMobile: false },
      'download',
    ],
    [
      'an old phone with no file sharing',
      { hasSaveFilePicker: false, canShareFiles: false, isMobile: true },
      'download',
    ],
  ] as const)('%s → %s', (_name, env, method) => {
    expect(chooseBackupMethod(env)).toBe(method);
  });
});
