import { describe, it, expect } from 'vitest';
import { lightenHex } from './lightenHex.js';

describe('lightenHex', () => {
  it('blends toward white by the given amount', () => {
    expect(lightenHex('#000000', 0.5)).toBe('rgb(128, 128, 128)');
    expect(lightenHex('#ffffff', 0.5)).toBe('rgb(255, 255, 255)');
  });

  it('amount 0 returns the original color unchanged', () => {
    expect(lightenHex('#8e2226', 0)).toBe('rgb(142, 34, 38)');
  });
});
