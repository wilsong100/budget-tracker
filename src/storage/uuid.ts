export type RandomBytes = (length: number) => Uint8Array;

export const cryptoRandomBytes: RandomBytes = (length) =>
  crypto.getRandomValues(new Uint8Array(length));

/**
 * A UUIDv7 (RFC 9562): 48 bits of Unix milliseconds, then random bits. Ids sort roughly by
 * creation time. Uses getRandomValues rather than randomUUID, which needs a secure context.
 */
export function uuidv7(now: number, random: RandomBytes = cryptoRandomBytes): string {
  if (!Number.isSafeInteger(now) || now < 0 || now >= 2 ** 48)
    throw new RangeError('time out of range for UUIDv7');
  const bytes = random(16);
  let time = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = time % 256;
    time = Math.floor(time / 256);
  }
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
