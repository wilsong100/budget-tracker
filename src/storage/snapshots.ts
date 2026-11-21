import { addDays, dayOfWeek, type IsoDate } from '../domain';

export type SnapshotReason = 'daily' | 'migration' | 'beforeRestore';

export interface SnapshotInfo {
  id: string;
  takenAt: number;
  /** The London day the snapshot was taken: the state before that day's first change. */
  day: IsoDate;
  reason: SnapshotReason;
}

export const DAILY_DAYS = 7;
export const WEEKLY_DAYS = 28;
/** Snapshots taken before a migration or a restore are kept for 28 days, newest 5 only. */
export const OTHER_KEEP = 5;

const weekStart = (day: IsoDate) => addDays(day, 1 - dayOfWeek(day));

/**
 * Which snapshots to delete: keep one a day for the last 7 days and one a week (the newest
 * in each Monday-to-Sunday week) for the last 4 weeks. Nothing older than 28 days is kept.
 */
export function snapshotIdsToDelete(snapshots: readonly SnapshotInfo[], today: IsoDate): string[] {
  const newestFirst = [...snapshots].sort(
    (a, b) => b.takenAt - a.takenAt || (a.id < b.id ? 1 : -1),
  );
  const dailyFrom = addDays(today, -(DAILY_DAYS - 1));
  const weeklyFrom = addDays(today, -(WEEKLY_DAYS - 1));
  const keep = new Set<string>();
  const keptDays = new Set<IsoDate>();
  const keptWeeks = new Set<IsoDate>();
  let others = 0;

  for (const snapshot of newestFirst) {
    if (snapshot.day < weeklyFrom) continue;
    if (snapshot.reason !== 'daily') {
      if (others < OTHER_KEEP) {
        keep.add(snapshot.id);
        others++;
      }
      continue;
    }
    if (snapshot.day >= dailyFrom) {
      if (!keptDays.has(snapshot.day)) {
        keptDays.add(snapshot.day);
        keep.add(snapshot.id);
      }
      continue;
    }
    const week = weekStart(snapshot.day);
    if (!keptWeeks.has(week)) {
      keptWeeks.add(week);
      keep.add(snapshot.id);
    }
  }
  return snapshots.filter((s) => !keep.has(s.id)).map((s) => s.id);
}
