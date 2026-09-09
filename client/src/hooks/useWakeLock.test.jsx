import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWakeLock } from './useWakeLock.js';

describe('useWakeLock', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('acquires a screen wake lock while active, and releases it when it becomes inactive', async () => {
    const release = vi.fn(() => Promise.resolve());
    const lock = { release };
    const request = vi.fn(() => Promise.resolve(lock));
    vi.stubGlobal('navigator', { ...navigator, wakeLock: { request } });

    const { rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: true } });
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'));

    rerender({ active: false });
    await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(1));
  });

  it('does nothing when the Wake Lock API is unavailable', () => {
    // The guard is `'wakeLock' in navigator` — a real unsupported browser
    // never defines the property at all, so the stub must omit it entirely
    // rather than set it to undefined (which the `in` check would still see).
    const { wakeLock, ...rest } = navigator;
    vi.stubGlobal('navigator', rest);
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });

  it('re-acquires on becoming visible again while still active', async () => {
    const request = vi.fn(() => Promise.resolve({ release: () => Promise.resolve() }));
    vi.stubGlobal('navigator', { ...navigator, wakeLock: { request } });
    renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });
});
