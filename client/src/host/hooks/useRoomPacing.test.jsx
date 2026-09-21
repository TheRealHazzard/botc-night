import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoomPacing } from './useRoomPacing.js';

describe('useRoomPacing', () => {
  afterEach(() => vi.useRealTimers());

  it('returns null outside the day phase', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { result } = renderHook(() => useRoomPacing('night', start, 1, 9, false));
    expect(result.current).toBe(null);
  });

  it('returns null with no dayStartedAt yet', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRoomPacing('day', null, 1, 9, false));
    expect(result.current).toBe(null);
  });

  it('returns null while a nomination is open, even well past the threshold', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { result } = renderHook(() => useRoomPacing('day', start, 3, 9, true));
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(result.current).toBe(null);
  });

  it('early days (night <= 2): null before 5 minutes, "quiet" after, never escalates', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { result } = renderHook(() => useRoomPacing('day', start, 1, 9, false));
    act(() => vi.advanceTimersByTime(4 * 60_000));
    expect(result.current).toBe(null);
    act(() => vi.advanceTimersByTime(90_000));
    expect(result.current).toBe('quiet');
    act(() => vi.advanceTimersByTime(30 * 60_000));
    expect(result.current).toBe('quiet'); // still no "pressure" — early days only ever get grace
  });

  it('middle days (night > 2, living > 5): "quiet" at 3 minutes, "pressure" at 6', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { result } = renderHook(() => useRoomPacing('day', start, 3, 9, false));
    act(() => vi.advanceTimersByTime(3 * 60_000 + 1000));
    expect(result.current).toBe('quiet');
    act(() => vi.advanceTimersByTime(3 * 60_000));
    expect(result.current).toBe('pressure');
  });

  it('the endgame (living <= 5) gets a longer grace period back and never escalates to "pressure"', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { result } = renderHook(() => useRoomPacing('day', start, 4, 3, false));
    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(result.current).toBe(null); // middle's 3-min threshold would already have fired here
    act(() => vi.advanceTimersByTime(90_000));
    expect(result.current).toBe('quiet');
    act(() => vi.advanceTimersByTime(30 * 60_000));
    expect(result.current).toBe('quiet'); // real debate shouldn't be rushed — no escalation
  });
});
