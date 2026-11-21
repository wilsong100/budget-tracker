/** JSON values that can be stored and backed up. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * JSON with object keys sorted, so the same data always gives the same text (and checksum).
 * Throws on values JSON can't hold exactly: non-finite numbers, undefined in arrays, functions.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('numbers must be finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => {
        if (item === undefined) throw new TypeError('arrays must not hold undefined');
        return canonicalJson(item);
      })
      .join(',')}]`;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  throw new TypeError(`can't store a ${typeof value} as JSON`);
}

export function isJson(value: unknown): value is Json {
  try {
    canonicalJson(value);
    return true;
  } catch {
    return false;
  }
}
