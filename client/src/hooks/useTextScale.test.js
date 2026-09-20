import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTextScale } from './useTextScale.js';

describe('useTextScale', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty('--text-scale');
  });

  it('starts at 1x and sets the CSS variable on mount', () => {
    const { result } = renderHook(() => useTextScale());
    expect(result.current.scale).toBe(1);
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1');
  });

  it('cycling steps through 1 -> 1.15 -> 1.3 -> back to 1', () => {
    const { result } = renderHook(() => useTextScale());
    act(() => result.current.cycle());
    expect(result.current.scale).toBe(1.15);
    act(() => result.current.cycle());
    expect(result.current.scale).toBe(1.3);
    act(() => result.current.cycle());
    expect(result.current.scale).toBe(1);
  });

  it('persists the chosen scale across a fresh mount (a returning player, a shared table phone)', () => {
    const { result, unmount } = renderHook(() => useTextScale());
    act(() => result.current.cycle());
    expect(result.current.scale).toBe(1.15);
    unmount();

    const { result: result2 } = renderHook(() => useTextScale());
    expect(result2.current.scale).toBe(1.15);
  });
});
