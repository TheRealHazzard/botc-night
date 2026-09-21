import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBluffBeat } from './useBluffBeat.js';

describe('useBluffBeat', () => {
  afterEach(() => vi.useRealTimers());

  it('a fresh mount with a beat already in history does not fire (nothing NEW happened)', () => {
    const { result } = renderHook(({ at }) => useBluffBeat(at), { initialProps: { at: 12345 } });
    expect(result.current).toBe(false);
  });

  it('a new timestamp landing after mount fires true, then clears itself', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ at }) => useBluffBeat(at), { initialProps: { at: null } });
    expect(result.current).toBe(false);

    act(() => rerender({ at: 1000 }));
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(1400));
    expect(result.current).toBe(false);
  });

  it('does not re-fire on an unrelated re-render with the same timestamp', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ at }) => useBluffBeat(at), { initialProps: { at: null } });
    act(() => rerender({ at: 1000 }));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1400));
    expect(result.current).toBe(false);

    rerender({ at: 1000 }); // same value, no new beat
    expect(result.current).toBe(false);
  });

  it('a second, later timestamp fires again', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ at }) => useBluffBeat(at), { initialProps: { at: null } });
    act(() => rerender({ at: 1000 }));
    act(() => vi.advanceTimersByTime(1400));
    expect(result.current).toBe(false);

    act(() => rerender({ at: 2000 }));
    expect(result.current).toBe(true);
  });

  it('handles a missing timestamp gracefully', () => {
    const { result } = renderHook(({ at }) => useBluffBeat(at), { initialProps: { at: undefined } });
    expect(result.current).toBe(false);
  });
});
