import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRevealCardSequencer } from './useRevealCardSequencer.js';

const players = [
  { id: 'slayer1', name: 'Fay', character: 'Slayer' },
  { id: 'imp1', name: 'Cass', character: 'Imp' },
  { id: 'soldier1', name: 'Bo', character: 'Soldier' },
];

const dayState = { phase: 'day', nightNumber: 1, wave: 0, players, pivotalHighlights: null };

const overWithOneCard = {
  phase: 'over', nightNumber: 3, wave: 0, players,
  victory: { winner: 'good', reason: 'The Demon is dead.' },
  pivotalHighlights: {
    playOfTheGame: { type: 'slayer-attempt', playerId: 'slayer1', targetId: 'imp1', impaired: true, targetWasDemon: true, score: 1 },
    gameWinningNomination: null,
    mvp: null,
  },
};

const overWithNoDrama = {
  phase: 'over', nightNumber: 1, wave: 0, players,
  victory: { winner: 'good', reason: 'x' },
  pivotalHighlights: { playOfTheGame: null, gameWinningNomination: null, mvp: null },
};

const overWithAllThree = {
  phase: 'over', nightNumber: 3, wave: 0, players,
  victory: { winner: 'good', reason: 'x' },
  pivotalHighlights: {
    playOfTheGame: { type: 'slayer-attempt', playerId: 'slayer1', targetId: 'imp1', impaired: true, targetWasDemon: true },
    gameWinningNomination: { nominatorId: 'soldier1', nomineeId: 'imp1', night: 3 },
    mvp: { playerId: 'slayer1', score: 1, topEvent: { type: 'slayer-attempt', playerId: 'slayer1', targetId: 'imp1', impaired: true, targetWasDemon: true } },
  },
};

describe('useRevealCardSequencer', () => {
  afterEach(() => vi.useRealTimers());

  it('stays idle forever when pivotalHighlights has nothing to show', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, rerender } = renderHook(
      ({ S, bannerShown }) => useRevealCardSequencer(S, bannerShown),
      { initialProps: { S: dayState, bannerShown: false } },
    );
    rerender({ S: overWithNoDrama, bannerShown: false });
    rerender({ S: overWithNoDrama, bannerShown: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(result.current.stage).toBe('idle');
  });

  it('arms on the phase change into "over", but waits for bannerShown before showing anything', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, rerender } = renderHook(
      ({ S, bannerShown }) => useRevealCardSequencer(S, bannerShown),
      { initialProps: { S: dayState, bannerShown: false } },
    );
    rerender({ S: overWithOneCard, bannerShown: false });
    await vi.advanceTimersByTimeAsync(2000);
    expect(result.current.stage).toBe('idle'); // armed, but the ring-glow/narration beat hasn't landed yet

    rerender({ S: overWithOneCard, bannerShown: true });
    await vi.advanceTimersByTimeAsync(800);
    expect(result.current.stage).toBe('idle'); // still under its own 900ms start delay
    await vi.advanceTimersByTimeAsync(150);
    expect(result.current.stage).toBe('active');
    expect(result.current.cards).toHaveLength(1);
    expect(result.current.cards[0].title).toBe('Play of the Game');
  });

  it('when bannerShown is already true at the moment of the phase change (reduced motion), still starts after its own delay', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, rerender } = renderHook(
      ({ S, bannerShown }) => useRevealCardSequencer(S, bannerShown),
      { initialProps: { S: dayState, bannerShown: true } },
    );
    rerender({ S: overWithOneCard, bannerShown: true });
    await vi.advanceTimersByTimeAsync(899);
    expect(result.current.stage).toBe('idle');
    await vi.advanceTimersByTimeAsync(10);
    expect(result.current.stage).toBe('active');
  });

  it('a cold start straight into an already-finished game never shows cards — a re-enactment, not a fresh moment', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(
      ({ S, bannerShown }) => useRevealCardSequencer(S, bannerShown),
      { initialProps: { S: overWithOneCard, bannerShown: true } },
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(result.current.stage).toBe('idle');
  });

  it('finish() moves the stage to done and clears the cards', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, rerender } = renderHook(
      ({ S, bannerShown }) => useRevealCardSequencer(S, bannerShown),
      { initialProps: { S: dayState, bannerShown: false } },
    );
    rerender({ S: overWithOneCard, bannerShown: true });
    await vi.advanceTimersByTimeAsync(900);
    expect(result.current.stage).toBe('active');

    act(() => result.current.finish());
    expect(result.current.stage).toBe('done');
    expect(result.current.cards).toEqual([]);
  });

  it('orders cards Play of the Game -> game-winning nomination -> MVP, with names resolved from S.players', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result, rerender } = renderHook(
      ({ S, bannerShown }) => useRevealCardSequencer(S, bannerShown),
      { initialProps: { S: dayState, bannerShown: false } },
    );
    rerender({ S: overWithAllThree, bannerShown: true });
    await vi.advanceTimersByTimeAsync(900);
    expect(result.current.cards.map(c => c.title)).toEqual([
      'Play of the Game', 'The nomination that ended it', 'MVP',
    ]);
    expect(result.current.cards[2].subtitle).toBe('Fay — Slayer');
  });
});
