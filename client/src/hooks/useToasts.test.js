import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToasts } from './useToasts.js';
import { showToast } from '../lib/toast.js';

describe('useToasts', () => {
  afterEach(() => vi.useRealTimers());

  it('starts empty', () => {
    const { result } = renderHook(() => useToasts());
    expect(result.current.toasts).toEqual([]);
  });

  it('picks up a toast shown after the hook is mounted', () => {
    const { result } = renderHook(() => useToasts());
    act(() => { showToast('Not day.'); });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({ message: 'Not day.', kind: 'error' });
  });

  it('a story-kind toast keeps its own kind and default duration, distinct from a plain error', () => {
    const { result } = renderHook(() => useToasts());
    act(() => { showToast('The Virgin fires.', { kind: 'story' }); });
    expect(result.current.toasts[0]).toMatchObject({ kind: 'story' });
  });

  it('auto-dismisses once its own duration elapses', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToasts());
    act(() => { showToast('Gone soon.', { duration: 1000 }); });
    expect(result.current.toasts).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('dismiss() removes a specific toast immediately, leaving others', () => {
    const { result } = renderHook(() => useToasts());
    act(() => { showToast('First.'); });
    act(() => { showToast('Second.'); });
    expect(result.current.toasts).toHaveLength(2);
    const firstId = result.current.toasts[0].id;
    act(() => { result.current.dismiss(firstId); });
    expect(result.current.toasts.map(t => t.message)).toEqual(['Second.']);
  });

  it('multiple mounted instances (player + host, in principle) each see the same shown toast', () => {
    const a = renderHook(() => useToasts());
    const b = renderHook(() => useToasts());
    act(() => { showToast('Broadcast.'); });
    expect(a.result.current.toasts).toHaveLength(1);
    expect(b.result.current.toasts).toHaveLength(1);
  });
});
