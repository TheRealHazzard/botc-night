import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { installFakeAudioContext, resetAudioCalls, toneCalls, noiseCalls } from '../../../test/fakeAudioContext.js';
import { useFatalBlowSequencer } from './useFatalBlowSequencer.js';

const dayState = { phase: 'day', nightNumber: 1, wave: 0, deaths: [], victory: null };
const overWithSlayerKill = {
  phase: 'over', nightNumber: 1, wave: 0,
  deaths: [{ name: 'Fay', cause: 'slayer' }],
  victory: { winner: 'good', reason: 'The Demon fell.' },
};

describe('useFatalBlowSequencer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stays idle when nothing has changed phase, or the ending has no single fresh moment', () => {
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => useFatalBlowSequencer(S), { initialProps: { S: dayState } });
    expect(result.current.stage).toBe('idle');

    const overNoBlow = { ...overWithSlayerKill, deaths: [], victory: { winner: 'good', reason: 'The Mastermind\'s day expired.' } };
    rerender({ S: overNoBlow });
    expect(result.current.stage).toBe('idle');
  });

  it('a phase-key change into "over" with a pickable blow starts flashing and plays the impact sting', () => {
    installFakeAudioContext();
    resetAudioCalls();
    const { result, rerender } = renderHook(({ S }) => useFatalBlowSequencer(S), { initialProps: { S: dayState } });
    rerender({ S: overWithSlayerKill });
    expect(result.current.stage).toBe('flashing');
    expect(result.current.blow).toEqual({ icon: 'crosshair', text: 'Fay falls.' });
    expect(toneCalls.length).toBeGreaterThan(0);
  });

  it('reduceMotion skips the flash entirely, even with a pickable blow', () => {
    installFakeAudioContext();
    const { result, rerender } = renderHook(
      ({ S, reduceMotion }) => useFatalBlowSequencer(S, { reduceMotion }),
      { initialProps: { S: dayState, reduceMotion: true } },
    );
    rerender({ S: overWithSlayerKill, reduceMotion: true });
    expect(result.current.stage).toBe('idle');
  });

  it('a same-phase-key re-render (e.g. an unrelated field on S changing) does not re-trigger the flash', () => {
    installFakeAudioContext();
    resetAudioCalls();
    const { result, rerender } = renderHook(({ S }) => useFatalBlowSequencer(S), { initialProps: { S: dayState } });
    rerender({ S: overWithSlayerKill });
    expect(result.current.stage).toBe('flashing');

    resetAudioCalls();
    rerender({ S: { ...overWithSlayerKill, extraneousField: 'unrelated update' } });
    expect(toneCalls.length).toBe(0); // impact sting not replayed
    expect(result.current.stage).toBe('flashing'); // untouched by finish() not having been called
  });

  it('finish() moves the stage to done and clears the blow', () => {
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => useFatalBlowSequencer(S), { initialProps: { S: dayState } });
    rerender({ S: overWithSlayerKill });
    expect(result.current.stage).toBe('flashing');

    act(() => result.current.finish());
    rerender({ S: overWithSlayerKill });
    expect(result.current.stage).toBe('done');
    expect(result.current.blow).toBeNull();
  });

  it('a later game ending re-triggers flashing again after a prior one finished', () => {
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => useFatalBlowSequencer(S), { initialProps: { S: dayState } });
    rerender({ S: overWithSlayerKill });
    act(() => result.current.finish());
    rerender({ S: overWithSlayerKill }); // still 'done'

    const lobbyAgain = { phase: 'lobby', nightNumber: 0, wave: 0, deaths: [], victory: null };
    rerender({ S: lobbyAgain });
    const nextOver = { phase: 'over', nightNumber: 1, wave: 0, deaths: [{ name: 'Bo', cause: 'execution' }], victory: { winner: 'evil', reason: 'x' } };
    rerender({ S: nextOver });
    expect(result.current.stage).toBe('flashing');
    expect(result.current.blow.text).toBe('Bo is executed.');
  });
});
