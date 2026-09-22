import { describe, it, expect } from 'vitest';
import { leadingNominee } from './leadingNominee.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'p' + i }));

describe('leadingNominee', () => {
  it('nobody qualifies -> {id: null, tied: false}', () => {
    expect(leadingNominee([], 2, players(7))).toEqual({ id: null, tied: false });
  });

  it('one nomination meeting its own threshold -> that nominee, not tied', () => {
    const noms = [{ day: 2, nomineeId: 'p0', closed: true, yesCount: 4, threshold: 4 }];
    expect(leadingNominee(noms, 2, players(7))).toEqual({ id: 'p0', tied: false });
  });

  it('a tie between two qualifying nominees -> {id: null, tied: true}', () => {
    const noms = [
      { day: 2, nomineeId: 'p0', closed: true, yesCount: 4, threshold: 4 },
      { day: 2, nomineeId: 'p1', closed: true, yesCount: 4, threshold: 4 },
    ];
    expect(leadingNominee(noms, 2, players(7))).toEqual({ id: null, tied: true });
  });

  it('a qualifying nominee who has since died is ignored', () => {
    const noms = [{ day: 2, nomineeId: 'p0', closed: true, yesCount: 4, threshold: 4 }];
    const alive = players(7).filter(p => p.id !== 'p0');
    expect(leadingNominee(noms, 2, alive)).toEqual({ id: null, tied: false });
  });

  // The actual bug this snapshot exists to fix: a nomination closes with
  // its own real threshold, then someone else dies later the same day
  // (Virgin, Witch, Golem, a Slayer shot), shrinking the living count —
  // but the nomination's own already-decided fate can't retroactively
  // change just because the table got smaller afterward.
  it('a nomination that fell short of its OWN threshold stays a non-qualifier, even after a later same-day death shrinks the living count', () => {
    // 7 living at close time -> real threshold was 4; only 3 yes -> fell short.
    const noms = [{ day: 2, nomineeId: 'p0', closed: true, yesCount: 3, threshold: 4 }];
    // 3 players died afterward, same day -> naive live recompute would be ceil(4/2) = 2, which 3 would clear.
    const aliveNow = players(4);
    expect(leadingNominee(noms, 2, aliveNow)).toEqual({ id: null, tied: false });
  });

  it('a nomination that met its own snapshotted threshold still qualifies regardless of a later same-day change in living count', () => {
    const noms = [{ day: 2, nomineeId: 'p0', closed: true, yesCount: 4, threshold: 4 }];
    const aliveNow = players(3).map((p, i) => (i === 0 ? { id: 'p0', name: 'p0' } : p));
    expect(leadingNominee(noms, 2, aliveNow)).toEqual({ id: 'p0', tied: false });
  });

  it('falls back to a live-recomputed threshold for a nomination with no snapshotted one (pre-existing data)', () => {
    // No `threshold` field at all -> falls back to ceil(alivePlayers.length / 2).
    const noms = [{ day: 2, nomineeId: 'p0', closed: true, yesCount: 4 }];
    expect(leadingNominee(noms, 2, players(7))).toEqual({ id: 'p0', tied: false });
    expect(leadingNominee(noms, 2, players(9))).toEqual({ id: null, tied: false });
  });

  it('ignores an open (not yet closed) nomination entirely', () => {
    const noms = [{ day: 2, nomineeId: 'p0', closed: false, yesCount: 7, threshold: 1 }];
    expect(leadingNominee(noms, 2, players(7))).toEqual({ id: null, tied: false });
  });

  it('ignores a closed nomination from a different day', () => {
    const noms = [{ day: 1, nomineeId: 'p0', closed: true, yesCount: 7, threshold: 1 }];
    expect(leadingNominee(noms, 2, players(7))).toEqual({ id: null, tied: false });
  });
});
