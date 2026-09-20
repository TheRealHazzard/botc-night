import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWhimBeat } from './useWhimBeat.js';

const whimLine = { night: 1, phase: 'night', text: 'A quiet decision was made, unseen.', secret: false, at: 1 };
const otherLine = { night: 1, phase: 'night', text: 'Poisoner poisoned Ada.', secret: true, at: 1 };

describe('useWhimBeat', () => {
  afterEach(() => vi.useRealTimers());

  it('a fresh mount with whim lines already in history does not fire (nothing NEW happened)', () => {
    const { result } = renderHook(({ log }) => useWhimBeat(log), { initialProps: { log: [whimLine] } });
    expect(result.current).toBe(false);
  });

  it('a new whim line landing after mount fires true, then clears itself', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ log }) => useWhimBeat(log), { initialProps: { log: [] } });
    expect(result.current).toBe(false);

    act(() => rerender({ log: [whimLine] }));
    expect(result.current).toBe(true);

    act(() => vi.advanceTimersByTime(2600));
    expect(result.current).toBe(false);
  });

  it('an unrelated new log line (a poison, a death) never fires it', () => {
    const { result, rerender } = renderHook(({ log }) => useWhimBeat(log), { initialProps: { log: [] } });
    rerender({ log: [otherLine] });
    expect(result.current).toBe(false);
  });

  it('does not re-fire on an unrelated re-render once already seen', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ log }) => useWhimBeat(log), { initialProps: { log: [] } });
    act(() => rerender({ log: [whimLine] }));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(2600));
    expect(result.current).toBe(false);

    rerender({ log: [whimLine] }); // same array contents, no new entry
    expect(result.current).toBe(false);
  });

  it('handles a missing log gracefully', () => {
    const { result } = renderHook(({ log }) => useWhimBeat(log), { initialProps: { log: undefined } });
    expect(result.current).toBe(false);
  });
});
