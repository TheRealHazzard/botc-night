import { describe, it, expect } from 'vitest';
import { seatPosition } from './ringLayout.js';

describe('seatPosition', () => {
  it('the first seat of any ring size sits at the top (12 o\'clock)', () => {
    const { left, top } = seatPosition(0, 4);
    expect(left).toBeCloseTo(50, 5);
    expect(top).toBeCloseTo(9, 5); // 50 - 41
  });

  it('seats are evenly spaced clockwise around the circle', () => {
    const a = seatPosition(0, 4);
    const b = seatPosition(1, 4); // a quarter turn clockwise = 3 o'clock
    expect(b.left).toBeCloseTo(91, 5); // 50 + 41
    expect(b.top).toBeCloseTo(50, 5);
    expect(a).not.toEqual(b);
  });

  it('every seat stays on the same 41%-radius circle around center (50,50)', () => {
    for (let n = 2; n <= 12; n++) {
      for (let i = 0; i < n; i++) {
        const { left, top } = seatPosition(i, n);
        const r = Math.hypot(left - 50, top - 50);
        expect(r).toBeCloseTo(41, 5);
      }
    }
  });
});
