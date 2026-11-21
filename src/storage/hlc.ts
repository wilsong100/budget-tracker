/**
 * Hybrid logical clock (Kulkarni et al.). Each change gets a timestamp that is never earlier
 * than any timestamp this device has seen, so a device whose clock is wrong can't reorder
 * edits. Encoded as text that sorts in time order: "000001763700000000:000000:<device>".
 */
export interface Hlc {
  /** Wall-clock milliseconds. */
  wall: number;
  /** Breaks ties within the same millisecond. */
  counter: number;
  /** The device that made the timestamp: the last tie-break. */
  node: string;
}

const WALL_DIGITS = 15;
const COUNTER_DIGITS = 6;
const MAX_COUNTER = 10 ** COUNTER_DIGITS - 1;
const ENCODED = /^(\d{15}):(\d{6}):(.+)$/;

export function encodeHlc({ wall, counter, node }: Hlc): string {
  if (!Number.isSafeInteger(wall) || wall < 0 || wall >= 10 ** WALL_DIGITS)
    throw new RangeError('HLC wall out of range');
  if (!Number.isInteger(counter) || counter < 0 || counter > MAX_COUNTER)
    throw new RangeError('HLC counter out of range');
  if (node === '' || node.includes(':'))
    throw new RangeError('HLC node must be non-empty with no colons');
  return `${String(wall).padStart(WALL_DIGITS, '0')}:${String(counter).padStart(COUNTER_DIGITS, '0')}:${node}`;
}

export function decodeHlc(text: string): Hlc {
  const match = ENCODED.exec(text);
  if (!match || match[3]!.includes(':'))
    throw new RangeError(`not an HLC timestamp: ${JSON.stringify(text)}`);
  return { wall: Number(match[1]), counter: Number(match[2]), node: match[3]! };
}

export function isHlc(text: unknown): text is string {
  if (typeof text !== 'string') return false;
  try {
    decodeHlc(text);
    return true;
  } catch {
    return false;
  }
}

/** A timestamp for a local change. */
export function tickHlc(last: Hlc | null, now: number, node: string): Hlc {
  const wall = Math.max(last?.wall ?? 0, now);
  const counter = last && wall === last.wall ? last.counter + 1 : 0;
  return { wall, counter, node };
}

/** Moves the clock past a timestamp received from another device. */
export function receiveHlc(last: Hlc | null, remote: Hlc, now: number, node: string): Hlc {
  const lastWall = last?.wall ?? 0;
  const wall = Math.max(lastWall, remote.wall, now);
  let counter = 0;
  if (wall === lastWall && wall === remote.wall)
    counter = Math.max(last!.counter, remote.counter) + 1;
  else if (wall === lastWall) counter = last!.counter + 1;
  else if (wall === remote.wall) counter = remote.counter + 1;
  return { wall, counter, node };
}

/** Wall-clock milliseconds of an encoded timestamp. */
export function hlcWall(text: string): number {
  return decodeHlc(text).wall;
}
