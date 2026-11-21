export type BuildTarget = 'web' | 'offline';

/** Which build this code is running in. Dev and test behave like the web build. */
export function buildTarget(mode: string = import.meta.env.MODE): BuildTarget {
  return mode === 'offline' ? 'offline' : 'web';
}

/** Sync is a paid add-on for the web app only. The Etsy offline file never syncs. */
export function canSync(target: BuildTarget): boolean {
  return target === 'web';
}
