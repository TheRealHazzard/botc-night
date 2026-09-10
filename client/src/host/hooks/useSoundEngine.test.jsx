import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { installFakeAudioContext, resetAudioCalls, lifecycleCalls } from '../../../test/fakeAudioContext.js';
import { useSoundEngine } from './useSoundEngine.js';

describe('useSoundEngine', () => {
  beforeEach(() => {
    installFakeAudioContext();
    resetAudioCalls();
    localStorage.clear();
  });

  it('starts unmuted by default, persists the toggle to localStorage', () => {
    const { result } = renderHook(() => useSoundEngine());
    expect(result.current.muted).toBe(false);
    act(() => result.current.setMuted(true));
    expect(result.current.muted).toBe(true);
    expect(localStorage.getItem('botc-host-muted')).toBe('1');
  });

  it('muting suspends the audio context, so a cue already mid-play is actually silenced', () => {
    const { result } = renderHook(() => useSoundEngine());
    act(() => result.current.setMuted(false)); // creates the context via resume()
    act(() => result.current.setMuted(true));
    expect(lifecycleCalls).toContain('suspend');
  });

  it('unmuting resumes the audio context', () => {
    const { result } = renderHook(() => useSoundEngine());
    act(() => result.current.setMuted(false));
    expect(lifecycleCalls).toContain('resume');
  });
});
