import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWhimConfirm } from './useWhimConfirm.js';

const entry1 = { night: 3, fired: true, helpsGood: true, livingCount: 4, goodAlive: 2, evilAlive: 2, at: 1 };
const entry2 = { night: 4, fired: false, helpsGood: false, livingCount: 3, goodAlive: 1, evilAlive: 2, at: 2 };

describe('useWhimConfirm', () => {
  it('a fresh mount with entries already in history does not show a card (nothing NEW happened)', () => {
    const { result } = renderHook(({ list }) => useWhimConfirm(list), { initialProps: { list: [entry1] } });
    expect(result.current.card).toBe(null);
  });

  it('a new entry landing after mount shows it as the card', () => {
    const { result, rerender } = renderHook(({ list }) => useWhimConfirm(list), { initialProps: { list: [] } });
    expect(result.current.card).toBe(null);

    act(() => rerender({ list: [entry1] }));
    expect(result.current.card).toBe(entry1);
  });

  it('a second new entry replaces the first as the shown card', () => {
    const { result, rerender } = renderHook(({ list }) => useWhimConfirm(list), { initialProps: { list: [entry1] } });
    act(() => rerender({ list: [entry1, entry2] }));
    expect(result.current.card).toBe(entry2);
  });

  it('dismiss clears the card without waiting on a new entry', () => {
    const { result, rerender } = renderHook(({ list }) => useWhimConfirm(list), { initialProps: { list: [] } });
    act(() => rerender({ list: [entry1] }));
    expect(result.current.card).toBe(entry1);
    act(() => result.current.dismiss());
    expect(result.current.card).toBe(null);
  });

  it('handles a missing list gracefully', () => {
    const { result } = renderHook(({ list }) => useWhimConfirm(list), { initialProps: { list: undefined } });
    expect(result.current.card).toBe(null);
  });
});
