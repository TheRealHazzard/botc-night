import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { installFakeAudioContext, resetAudioCalls, toneCalls } from '../../../test/fakeAudioContext.js';
import { usePhaseFade } from './usePhaseFade.js';

const lobby = { phase: 'lobby', nightNumber: 0, wave: 0, deaths: [], victory: null };
const night = { phase: 'night', nightNumber: 1, wave: 1, deaths: [], victory: null };
const day = { phase: 'day', nightNumber: 1, wave: 0, deaths: [], victory: null };
const overSlayer = { phase: 'over', nightNumber: 1, wave: 0, deaths: [{ name: 'Fay', cause: 'slayer' }], victory: { winner: 'good', reason: 'x' } };
const overNoBlow = { phase: 'over', nightNumber: 1, wave: 0, deaths: [], victory: { winner: 'good', reason: "The Mastermind's day expired." } };

function stubReducedMotion(matches) {
  vi.stubGlobal('matchMedia', () => ({ matches, addEventListener: () => {}, removeEventListener: () => {} }));
}

describe('usePhaseFade', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('the very first data shows immediately, no fade', () => {
    stubReducedMotion(false);
    const { result } = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: lobby } });
    expect(result.current.displayS).toEqual(lobby);
    expect(result.current.fading).toBe(false);
  });

  it('a same-phase-key update applies immediately, no fade, no sound cue', () => {
    stubReducedMotion(false);
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: night } });
    resetAudioCalls(); // clear whatever the initial mount's own "changed" transition played
    const nightUpdated = { ...night, deaths: [{ name: 'X', cause: 'demon' }] }; // same phase:night:wave key
    rerender({ S: nightUpdated });
    expect(result.current.displayS).toEqual(nightUpdated);
    expect(result.current.fading).toBe(false);
    expect(toneCalls.length).toBe(0);
  });

  it('a real phase transition fades: sound fires immediately, displayS holds until the transition completes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubReducedMotion(false);
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: day } });
    resetAudioCalls();

    act(() => rerender({ S: night }));
    expect(toneCalls.length).toBeGreaterThan(0); // playNightFalls fired immediately
    expect(result.current.fading).toBe(true);
    expect(result.current.transClass).toBe('dusk');
    expect(result.current.displayS).toEqual(day); // still showing the OLD phase

    await act(async () => { await vi.advanceTimersByTimeAsync(960); });
    expect(result.current.fading).toBe(false);
    expect(result.current.displayS).toEqual(night);
  });

  it('reduceMotion skips the fade — displayS updates immediately, sound cue still fires', () => {
    stubReducedMotion(true);
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: day } });
    resetAudioCalls();
    rerender({ S: night });
    expect(toneCalls.length).toBeGreaterThan(0);
    expect(result.current.fading).toBe(false);
    expect(result.current.displayS).toEqual(night);
  });

  it('a fatal-blow transition holds displayS at the old phase, plays no victory sound yet, until onFatalFlashDone', () => {
    stubReducedMotion(false);
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: day } });
    resetAudioCalls();

    rerender({ S: overSlayer });
    expect(result.current.fatalFlashing).toBe(true);
    expect(result.current.blow).toEqual({ icon: 'crosshair', text: 'Fay falls.' });
    expect(result.current.displayS).toEqual(day); // NOT the reveal yet
    expect(result.current.fading).toBe(false); // no normal fade running alongside it

    act(() => result.current.onFatalFlashDone());
    expect(result.current.fatalFlashing).toBe(false);
    expect(result.current.displayS).toEqual(overSlayer);
    expect(toneCalls.some(c => c.freq > 150)).toBe(true); // playVictory('good') triad, only now
  });

  it('an "over" transition with no pickable blow just fades normally and plays victory immediately', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubReducedMotion(false);
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: day } });
    resetAudioCalls();

    act(() => rerender({ S: overNoBlow }));
    expect(result.current.fatalFlashing).toBe(false);
    expect(toneCalls.length).toBeGreaterThan(0); // playVictory fired immediately, no flash to wait for
    expect(result.current.fading).toBe(true);
    expect(result.current.transClass).toBe('over');

    await act(async () => { await vi.advanceTimersByTimeAsync(570); });
    expect(result.current.displayS).toEqual(overNoBlow);
  });
});
