import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceActivity } from './useVoiceActivity.js';
import { onSpeakingChange } from '../lib/speech.js';

vi.mock('../lib/speech.js', () => ({ onSpeakingChange: vi.fn() }));

describe('useVoiceActivity', () => {
  it('starts false, and flips to whatever speech.js reports', () => {
    let emit;
    onSpeakingChange.mockImplementation(fn => { emit = fn; return () => {}; });

    const { result } = renderHook(() => useVoiceActivity());
    expect(result.current).toBe(false);

    act(() => emit(true));
    expect(result.current).toBe(true);

    act(() => emit(false));
    expect(result.current).toBe(false);
  });

  it('unsubscribes on unmount', () => {
    const unsubscribe = vi.fn();
    onSpeakingChange.mockReturnValue(unsubscribe);
    const { unmount } = renderHook(() => useVoiceActivity());
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
