import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useValueBeat } from './useValueBeat.js';

const anyChange = (prev, next) => prev !== next;

describe('useValueBeat', () => {
  afterEach(() => vi.useRealTimers());

  it('a fresh mount never fires, regardless of the initial value', () => {
    const { result } = renderHook(({ v }) => useValueBeat(v, { shouldFire: anyChange, durationMs: 1000 }), {
      initialProps: { v: 'anything' },
    });
    expect(result.current).toBe(false);
  });

  it('a transition shouldFire approves fires true, then clears after durationMs', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useValueBeat(v, { shouldFire: anyChange, durationMs: 500 }), {
      initialProps: { v: 'a' },
    });
    act(() => rerender({ v: 'b' }));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(false);
  });

  it('a transition shouldFire rejects never fires', () => {
    const shouldFire = () => false;
    const { result, rerender } = renderHook(({ v }) => useValueBeat(v, { shouldFire, durationMs: 500 }), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    expect(result.current).toBe(false);
  });

  it('shouldFire receives both the previous and next value, in that order', () => {
    const seen = [];
    const shouldFire = (prev, next) => { seen.push([prev, next]); return false; };
    const { rerender } = renderHook(({ v }) => useValueBeat(v, { shouldFire, durationMs: 500 }), {
      initialProps: { v: 1 },
    });
    rerender({ v: 2 });
    expect(seen).toEqual([[1, 2]]);
  });

  it('re-rendering with the same value does not re-fire', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useValueBeat(v, { shouldFire: anyChange, durationMs: 500 }), {
      initialProps: { v: 'a' },
    });
    act(() => rerender({ v: 'b' }));
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBe(false);

    rerender({ v: 'b' });
    expect(result.current).toBe(false);
  });
});
