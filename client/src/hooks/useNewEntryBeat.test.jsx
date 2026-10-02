import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNewEntryBeat } from './useNewEntryBeat.js';

const findX = fresh => fresh.find(e => e === 'x');

describe('useNewEntryBeat', () => {
  afterEach(() => vi.useRealTimers());

  it('a fresh mount with a matching entry already in the list does not fire', () => {
    const { result } = renderHook(({ list }) => useNewEntryBeat(list, { findMatch: findX, durationMs: 500 }), {
      initialProps: { list: ['x'] },
    });
    expect(result.current).toBeNull();
  });

  it('a new matching entry fires with the matched value, then clears', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ list }) => useNewEntryBeat(list, { findMatch: findX, durationMs: 500 }), {
      initialProps: { list: [] },
    });
    act(() => rerender({ list: ['x'] }));
    expect(result.current).toBe('x');
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toBeNull();
  });

  it('a new entry that does not match never fires', () => {
    const { result, rerender } = renderHook(({ list }) => useNewEntryBeat(list, { findMatch: findX, durationMs: 500 }), {
      initialProps: { list: [] },
    });
    rerender({ list: ['y'] });
    expect(result.current).toBeNull();
  });

  it('only the fresh slice is handed to findMatch, never already-seen entries', () => {
    const seen = [];
    const findMatch = fresh => { seen.push([...fresh]); return undefined; };
    const { rerender } = renderHook(({ list }) => useNewEntryBeat(list, { findMatch, durationMs: 500 }), {
      initialProps: { list: ['a'] },
    });
    rerender({ list: ['a', 'b', 'c'] });
    expect(seen).toEqual([['b', 'c']]);
  });

  it('several new entries landing at once still only matches within the fresh slice', () => {
    const { result, rerender } = renderHook(({ list }) => useNewEntryBeat(list, { findMatch: findX, durationMs: 500 }), {
      initialProps: { list: [] },
    });
    rerender({ list: ['a', 'x', 'b'] });
    expect(result.current).toBe('x');
  });

  it('a shrinking or unchanged list never fires', () => {
    const { result, rerender } = renderHook(({ list }) => useNewEntryBeat(list, { findMatch: findX, durationMs: 500 }), {
      initialProps: { list: ['a', 'b'] },
    });
    rerender({ list: ['a'] });
    expect(result.current).toBeNull();
    rerender({ list: ['a'] });
    expect(result.current).toBeNull();
  });

  it('treats a missing/undefined list as empty, without throwing', () => {
    const { result, rerender } = renderHook(({ list }) => useNewEntryBeat(list, { findMatch: findX, durationMs: 500 }), {
      initialProps: { list: undefined },
    });
    expect(result.current).toBeNull();
    rerender({ list: ['x'] });
    expect(result.current).toBe('x');
  });
});
