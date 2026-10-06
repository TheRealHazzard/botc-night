import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheorySequencer } from './useTheorySequencer.js';

const theory = (playerName, n) => ({ playerId: playerName, playerName, guesses: Array.from({ length: n }, () => ({})) });

describe('useTheorySequencer', () => {
  it('a cold start with existing theories already on it does not flash — a re-enactment, not a fresh moment', () => {
    const { result, rerender } = renderHook(({ S }) => useTheorySequencer(S), {
      initialProps: { S: { theories: [theory('Fay', 2)] } },
    });
    expect(result.current.current).toBeNull();
    rerender({ S: { theories: [theory('Fay', 2)] } }); // same length, no change
    expect(result.current.current).toBeNull();
  });

  it('a theory landing after the cold start flashes it', () => {
    const { result, rerender } = renderHook(({ S }) => useTheorySequencer(S), {
      initialProps: { S: { theories: [] } },
    });
    rerender({ S: { theories: [theory('Fay', 3)] } });
    expect(result.current.current).toEqual({ playerName: 'Fay', guessCount: 3 });
  });

  it('two theories landing at once are queued, not dropped — finish() advances to the next', () => {
    const { result, rerender } = renderHook(({ S }) => useTheorySequencer(S), {
      initialProps: { S: { theories: [] } },
    });
    rerender({ S: { theories: [theory('Fay', 1), theory('Bo', 2)] } });
    expect(result.current.current).toEqual({ playerName: 'Fay', guessCount: 1 });

    act(() => result.current.finish());
    expect(result.current.current).toEqual({ playerName: 'Bo', guessCount: 2 });

    act(() => result.current.finish());
    expect(result.current.current).toBeNull();
  });

  it('the array shrinking (a new game reset it) drops whatever was still queued from the old game', () => {
    const { result, rerender } = renderHook(({ S }) => useTheorySequencer(S), {
      initialProps: { S: { theories: [] } },
    });
    rerender({ S: { theories: [theory('Fay', 1), theory('Bo', 1)] } });
    expect(result.current.current).toEqual({ playerName: 'Fay', guessCount: 1 });

    // A new game starts: theories resets to [] without finish() ever
    // having been called on the still-showing one — Bo, still queued
    // behind Fay from the old game, is dropped rather than shown later
    // as if it belonged to the new game.
    rerender({ S: { theories: [] } });
    rerender({ S: { theories: [theory('Cy', 1)] } });
    // Fay's flash (from the old game) is still up — finishing it reveals
    // Cy's, the new game's own real submission, not Bo's dropped one.
    act(() => result.current.finish());
    expect(result.current.current).toEqual({ playerName: 'Cy', guessCount: 1 });
  });
});
