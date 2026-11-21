import { describe, expect, it } from 'vitest';
import { browserMarker, memoryMarker } from './marker';

function fakeEnv() {
  const items = new Map<string, string>();
  let cookies: string[] = [];
  return {
    localStorage: {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    },
    document: {
      get cookie() {
        return cookies.join('; ');
      },
      set cookie(value: string) {
        const [pair] = value.split(';');
        const [name] = pair!.split('=');
        cookies = cookies.filter((c) => !c.startsWith(`${name}=`));
        if (!/Max-Age=0/.test(value)) cookies.push(pair!);
      },
    },
    items,
  };
}

describe('browserMarker', () => {
  it('survives losing either localStorage or the cookie', () => {
    const env = fakeEnv();
    const marker = browserMarker({ ...env, path: '/budget-planner/' });
    expect(marker.has()).toBe(false);
    marker.set();
    marker.set();
    expect(env.document.cookie).toBe('budget_planner_has_data=1');
    env.items.clear();
    expect(marker.has()).toBe(true);
    marker.set();
    env.document.cookie = 'budget_planner_has_data=; Max-Age=0';
    expect(marker.has()).toBe(true);
    marker.clear();
    expect(marker.has()).toBe(false);
  });

  it('never throws when storage is blocked', () => {
    const blocked = {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {
          throw new Error('blocked');
        },
      },
      document: {
        get cookie(): string {
          throw new Error('blocked');
        },
        set cookie(_v: string) {
          throw new Error('blocked');
        },
      },
    };
    const marker = browserMarker(blocked);
    expect(() => marker.set()).not.toThrow();
    expect(marker.has()).toBe(false);
    expect(() => marker.clear()).not.toThrow();
  });

  it('works with neither storage present', () => {
    const marker = browserMarker({});
    marker.set();
    expect(marker.has()).toBe(false);
    marker.clear();
  });
});

describe('memoryMarker', () => {
  it('remembers in memory', () => {
    const marker = memoryMarker();
    marker.set();
    expect(marker.has()).toBe(true);
    marker.clear();
    expect(marker.value).toBe(false);
  });
});
