import { describe, expect, it } from 'vitest';
import { addDays, toDayNumber } from '../domain';
import { snapshotIdsToDelete, type SnapshotInfo } from './snapshots';

const TODAY = '2026-11-21'; // a Saturday
let nextId = 1;
const snap = (day: string, reason: SnapshotInfo['reason'] = 'daily', hour = 9): SnapshotInfo => ({
  id: String(nextId++).padStart(4, '0'),
  takenAt: toDayNumber(day) * 86_400_000 + hour * 3_600_000,
  day,
  reason,
});

describe('snapshotIdsToDelete', () => {
  it('keeps one a day for 7 days and one a week for 4 weeks', () => {
    const daily = Array.from({ length: 40 }, (_, i) => snap(addDays(TODAY, -i)));
    const deleted = new Set(snapshotIdsToDelete(daily, TODAY));
    const kept = daily.filter((s) => !deleted.has(s.id)).map((s) => s.day);
    expect(kept).toEqual([
      // the last 7 days
      '2026-11-21',
      '2026-11-20',
      '2026-11-19',
      '2026-11-18',
      '2026-11-17',
      '2026-11-16',
      '2026-11-15',
      // then the newest in each of 4 Monday-to-Sunday weeks, back to 28 days ago
      '2026-11-14', // week of 9 Nov
      '2026-11-08', // week of 2 Nov
      '2026-11-01', // week of 26 Oct
      '2026-10-25', // week of 19 Oct: 27 days ago, the oldest kept
    ]);
  });

  it('keeps only the newest snapshot of a day', () => {
    const early = snap(TODAY, 'daily', 8);
    const late = snap(TODAY, 'daily', 20);
    expect(snapshotIdsToDelete([early, late], TODAY)).toEqual([early.id]);
  });

  it('keeps the newest 5 migration and restore snapshots from the last 28 days', () => {
    const others = Array.from({ length: 7 }, (_, i) =>
      snap(addDays(TODAY, -i), i % 2 ? 'migration' : 'beforeRestore'),
    );
    const old = snap(addDays(TODAY, -30), 'migration');
    const deleted = snapshotIdsToDelete([...others, old], TODAY);
    expect(deleted.sort()).toEqual([others[5]!.id, others[6]!.id, old.id].sort());
  });

  it('keeps everything when there is little', () => {
    expect(
      snapshotIdsToDelete([snap(TODAY), snap(addDays(TODAY, -1), 'migration')], TODAY),
    ).toEqual([]);
    expect(snapshotIdsToDelete([], TODAY)).toEqual([]);
  });
});
