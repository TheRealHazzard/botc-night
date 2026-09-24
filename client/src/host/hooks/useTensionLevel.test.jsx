import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { setTensionIntensity } from '../lib/soundEngine.js';
import { useTensionLevel } from './useTensionLevel.js';

vi.mock('../lib/soundEngine.js', () => ({ setTensionIntensity: vi.fn() }));

function mkPlayer(id, alive = true) { return { id, name: id, alive }; }

describe('useTensionLevel', () => {
  beforeEach(() => setTensionIntensity.mockClear());

  it('does nothing with no players at all', () => {
    renderHook(() => useTensionLevel({ players: [] }));
    expect(setTensionIntensity).not.toHaveBeenCalled();
  });

  it('everyone alive, no open nomination -> zero tension', () => {
    const S = { players: [mkPlayer('a'), mkPlayer('b'), mkPlayer('c')], nominations: [] };
    renderHook(() => useTensionLevel(S));
    expect(setTensionIntensity).toHaveBeenCalledWith(0);
  });

  it('half the table dead raises tension proportionally', () => {
    const S = { players: [mkPlayer('a', false), mkPlayer('b', false), mkPlayer('c'), mkPlayer('d')], nominations: [] };
    renderHook(() => useTensionLevel(S));
    expect(setTensionIntensity).toHaveBeenCalledWith(0.5);
  });

  it('a nomination sitting exactly on its threshold maxes out vote tension even with everyone alive', () => {
    const S = {
      players: [mkPlayer('a'), mkPlayer('b'), mkPlayer('c'), mkPlayer('d')],
      nominations: [{ closed: false, threshold: 2, votes: [{ vote: 'yes' }, { vote: 'yes' }] }],
    };
    renderHook(() => useTensionLevel(S));
    expect(setTensionIntensity).toHaveBeenCalledWith(1);
  });

  it('reads live votes, not the still-zero yesCount field a still-open nomination has', () => {
    const S = {
      players: [mkPlayer('a'), mkPlayer('b'), mkPlayer('c'), mkPlayer('d')],
      nominations: [{ closed: false, threshold: 2, yesCount: 0, votes: [{ vote: 'yes' }, { vote: 'yes' }] }],
    };
    renderHook(() => useTensionLevel(S));
    expect(setTensionIntensity).toHaveBeenCalledWith(1);
  });

  it('a closed nomination no longer contributes vote tension', () => {
    const S = {
      players: [mkPlayer('a'), mkPlayer('b')],
      nominations: [{ closed: true, threshold: 1, votes: [{ vote: 'yes' }] }],
    };
    renderHook(() => useTensionLevel(S));
    expect(setTensionIntensity).toHaveBeenCalledWith(0);
  });

  it('disabled ramps to silent regardless of how tense the game actually is', () => {
    const S = { players: [mkPlayer('a', false), mkPlayer('b')], nominations: [] };
    renderHook(() => useTensionLevel(S, { enabled: false }));
    expect(setTensionIntensity).toHaveBeenCalledWith(0);
  });

  it('a trivial re-render with an unchanged level does not re-ramp', () => {
    const S = { players: [mkPlayer('a'), mkPlayer('b')], nominations: [] };
    const { rerender } = renderHook(({ s }) => useTensionLevel(s), { initialProps: { s: S } });
    expect(setTensionIntensity).toHaveBeenCalledTimes(1);
    rerender({ s: { ...S } }); // new object identity, same actual tension
    expect(setTensionIntensity).toHaveBeenCalledTimes(1);
  });
});
