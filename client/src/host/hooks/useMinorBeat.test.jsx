import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { installFakeAudioContext, resetAudioCalls, toneCalls, noiseCalls } from '../../../test/fakeAudioContext.js';
import { useMinorBeat } from './useMinorBeat.js';

describe('useMinorBeat', () => {
  afterEach(() => vi.useRealTimers());

  it('a fresh mount with deaths already in history does not fire', () => {
    installFakeAudioContext();
    const { result } = renderHook(({ deaths }) => useMinorBeat(deaths), {
      initialProps: { deaths: [{ name: 'Ada', cause: 'execution' }] },
    });
    expect(result.current).toBeNull();
  });

  it('a fresh execution death fires the beat and plays the impact sting, then clears itself', () => {
    installFakeAudioContext();
    resetAudioCalls();
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ deaths }) => useMinorBeat(deaths), { initialProps: { deaths: [] } });

    act(() => rerender({ deaths: [{ name: 'Bo', cause: 'execution' }] }));
    expect(result.current).toEqual({ name: 'Bo', cause: 'execution' });
    expect(toneCalls.length + noiseCalls.length).toBeGreaterThan(0);

    act(() => vi.advanceTimersByTime(1700));
    expect(result.current).toBeNull();
  });

  it('a fresh night-kill death does not fire the beat (that one already gets the dusk/dawn transition)', () => {
    installFakeAudioContext();
    resetAudioCalls();
    const { result, rerender } = renderHook(({ deaths }) => useMinorBeat(deaths), { initialProps: { deaths: [] } });
    rerender({ deaths: [{ name: 'Bo', cause: 'demon' }] });
    expect(result.current).toBeNull();
    expect(toneCalls.length).toBe(0);
  });

  it('reduceMotion suppresses the beat entirely, sting included', () => {
    installFakeAudioContext();
    resetAudioCalls();
    const { result, rerender } = renderHook(
      ({ deaths, reduceMotion }) => useMinorBeat(deaths, { reduceMotion }),
      { initialProps: { deaths: [], reduceMotion: true } },
    );
    rerender({ deaths: [{ name: 'Bo', cause: 'execution' }], reduceMotion: true });
    expect(result.current).toBeNull();
    expect(toneCalls.length + noiseCalls.length).toBe(0);
  });

  it('muted still fires the visual beat but plays no sound', () => {
    installFakeAudioContext();
    resetAudioCalls();
    const { result, rerender } = renderHook(
      ({ deaths, muted }) => useMinorBeat(deaths, { muted }),
      { initialProps: { deaths: [], muted: true } },
    );
    rerender({ deaths: [{ name: 'Bo', cause: 'execution' }], muted: true });
    expect(result.current).toEqual({ name: 'Bo', cause: 'execution' });
    expect(toneCalls.length + noiseCalls.length).toBe(0);
  });
});
