import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { installFakeAudioContext, resetAudioCalls, toneCalls } from '../../../test/fakeAudioContext.js';
import { useNotableBeat } from './useNotableBeat.js';

describe('useNotableBeat', () => {
  beforeEach(() => {
    installFakeAudioContext();
    resetAudioCalls();
  });
  afterEach(() => vi.useRealTimers());

  it('a fresh mount with a beat already in history does not fire (nothing NEW happened)', () => {
    const { result } = renderHook(({ at }) => useNotableBeat(at), { initialProps: { at: 12345 } });
    expect(result.current).toBe(false);
    expect(toneCalls.length).toBe(0);
  });

  it('a new timestamp landing after mount fires true, plays the chime, then clears itself', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ at }) => useNotableBeat(at), { initialProps: { at: null } });
    expect(result.current).toBe(false);

    act(() => rerender({ at: 1000 }));
    expect(result.current).toBe(true);
    expect(toneCalls.length).toBeGreaterThan(0);

    act(() => vi.advanceTimersByTime(1300));
    expect(result.current).toBe(false);
  });

  it('muted: the pulse still fires visually, but nothing plays', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ at }) => useNotableBeat(at, true), { initialProps: { at: null } });
    act(() => rerender({ at: 1000 }));
    expect(result.current).toBe(true);
    expect(toneCalls.length).toBe(0);
  });

  it('does not re-fire on an unrelated re-render with the same timestamp', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ at }) => useNotableBeat(at), { initialProps: { at: null } });
    act(() => rerender({ at: 1000 }));
    act(() => vi.advanceTimersByTime(1300));
    expect(result.current).toBe(false);

    rerender({ at: 1000 }); // same value, no new beat
    expect(result.current).toBe(false);
  });

  it('a second, later timestamp fires again', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ at }) => useNotableBeat(at), { initialProps: { at: null } });
    act(() => rerender({ at: 1000 }));
    act(() => vi.advanceTimersByTime(1300));
    expect(result.current).toBe(false);

    act(() => rerender({ at: 2000 }));
    expect(result.current).toBe(true);
  });

  it('handles a missing timestamp gracefully', () => {
    const { result } = renderHook(({ at }) => useNotableBeat(at), { initialProps: { at: undefined } });
    expect(result.current).toBe(false);
  });
});
