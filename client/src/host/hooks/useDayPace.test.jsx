import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDayPace } from './useDayPace.js';

const TOTAL = 5 * 60_000;

describe('useDayPace', () => {
  afterEach(() => vi.useRealTimers());

  it('returns null with no dayStartedAt yet', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDayPace(null, TOTAL));
    expect(result.current).toBe(null);
  });

  it('starts green the moment the day begins', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { result } = renderHook(() => useDayPace(start, TOTAL));
    expect(result.current).toBe('green');
  });

  it('turns yellow once under 3 minutes remain, red once under 1 minute remains', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { result } = renderHook(() => useDayPace(start, TOTAL));

    act(() => vi.advanceTimersByTime(2 * 60_000 + 1000)); // 2:01 elapsed -> 2:59 remaining
    expect(result.current).toBe('yellow');

    act(() => vi.advanceTimersByTime(2 * 60_000)); // 4:01 elapsed -> 0:59 remaining
    expect(result.current).toBe('red');
  });

  it('stays red once the total has fully elapsed, however long the day keeps running', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { result } = renderHook(() => useDayPace(start, TOTAL));
    act(() => vi.advanceTimersByTime(TOTAL + 20 * 60_000));
    expect(result.current).toBe('red');
  });

  it('ticks on its own once mounted, without a prop change', () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { result } = renderHook(() => useDayPace(start, TOTAL));
    expect(result.current).toBe('green');
    act(() => vi.advanceTimersByTime(3 * 60_000 + 1000));
    expect(result.current).toBe('yellow');
  });
});
