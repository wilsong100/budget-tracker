/**
 * A small marker kept outside IndexedDB (in localStorage and a cookie) that says this browser
 * has held a budget. If the database comes up empty but the marker is still there, the app
 * shows "Your budget seems to be missing" instead of onboarding. The marker holds no budget
 * data: the cookie's value is just "1".
 */
export interface DataMarker {
  set(): void;
  has(): boolean;
  clear(): void;
}

const KEY = 'budget-planner:has-data';
const COOKIE = 'budget_planner_has_data';
const FOUR_HUNDRED_DAYS = 400 * 86_400;

interface MarkerEnv {
  localStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  document?: { cookie: string };
  /** Cookie path; leave out to use the page's directory. */
  path?: string;
}

/** Storage can throw (blocked cookies, Safari quirks); the marker must never break a save. */
function quietly<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function browserMarker(
  env: MarkerEnv = { localStorage: globalThis.localStorage, document: globalThis.document },
): DataMarker {
  const path = env.path ? `; Path=${env.path}` : '';
  const hasCookie = () =>
    (env.document?.cookie ?? '').split(';').some((part) => part.trim() === `${COOKIE}=1`);
  return {
    set() {
      quietly(() => env.localStorage?.setItem(KEY, '1'), undefined);
      if (!quietly(hasCookie, true)) {
        quietly(() => {
          if (env.document)
            env.document.cookie = `${COOKIE}=1; Max-Age=${FOUR_HUNDRED_DAYS}; SameSite=Strict${path}`;
        }, undefined);
      }
    },
    has() {
      return (
        quietly(() => env.localStorage?.getItem(KEY) === '1', false) || quietly(hasCookie, false)
      );
    },
    clear() {
      quietly(() => env.localStorage?.removeItem(KEY), undefined);
      quietly(() => {
        if (env.document) env.document.cookie = `${COOKIE}=; Max-Age=0; SameSite=Strict${path}`;
      }, undefined);
    },
  };
}

export function memoryMarker(): DataMarker & { readonly value: boolean } {
  let value = false;
  return {
    get value() {
      return value;
    },
    set: () => (value = true),
    has: () => value,
    clear: () => (value = false),
  };
}
