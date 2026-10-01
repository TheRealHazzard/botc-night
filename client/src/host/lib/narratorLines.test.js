import { describe, it, expect } from 'vitest';
import { nightOpenLine, noDeathDayLine, revealLine } from './narratorLines.js';

describe('narratorLines', () => {
  it('nightOpenLine always returns the canonical opener on night 1, regardless of deaths', () => {
    expect(nightOpenLine(1, 0)).toBe('Close your eyes. The town sleeps.');
    expect(nightOpenLine(1, 2)).toBe('Close your eyes. The town sleeps.');
  });

  it('nightOpenLine rotates away from the canonical opener from night 2 on', () => {
    for (let n = 2; n <= 8; n++) {
      expect(nightOpenLine(n, 0)).not.toBe('Close your eyes. The town sleeps.');
    }
  });

  it('nightOpenLine is a pure, deterministic function of (night, deaths) — same inputs, same output every call', () => {
    expect(nightOpenLine(4, 1)).toBe(nightOpenLine(4, 1));
    expect(nightOpenLine(5, 0)).toBe(nightOpenLine(5, 0));
  });

  it('nightOpenLine uses a different register once a death has happened', () => {
    // Across a spread of night numbers, deathsSoFar>0 should land on a
    // visibly different pool from deathsSoFar===0 at least some of the
    // time — not merely "technically a different seed string".
    let anyDifferent = false;
    for (let n = 2; n <= 10; n++) {
      if (nightOpenLine(n, 0) !== nightOpenLine(n, 1)) anyDifferent = true;
    }
    expect(anyDifferent).toBe(true);
  });

  it('noDeathDayLine always returns the canonical line on day 1', () => {
    expect(noDeathDayLine(1)).toBe('Everyone wakes. That should worry you.');
  });

  it('noDeathDayLine rotates away from the canonical line from day 2 on', () => {
    for (let n = 2; n <= 8; n++) {
      expect(noDeathDayLine(n)).not.toBe('Everyone wakes. That should worry you.');
    }
  });

  it('noDeathDayLine is deterministic', () => {
    expect(noDeathDayLine(3)).toBe(noDeathDayLine(3));
  });

  it('revealLine is deterministic for the same seed', () => {
    expect(revealLine(1234)).toBe(revealLine(1234));
    expect(revealLine('a-game')).toBe(revealLine('a-game'));
  });

  it('revealLine varies across different seeds', () => {
    const seen = new Set();
    for (let s = 0; s < 20; s++) seen.add(revealLine(s));
    expect(seen.size).toBeGreaterThan(1);
  });
});
