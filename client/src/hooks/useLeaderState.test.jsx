import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLeaderState, isHostCodeError } from './useLeaderState.js';
import { mockFetch } from '../../test/fetchMock.js';

// Same fake as the host's own useHostState.test.jsx — useLeaderState.js is
// a deliberate near-copy of that hook's connection logic (see its own
// comment), so it's tested the same way.
class FakeEventSource {
  constructor(url) {
    FakeEventSource.instances.push(this);
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.closed = false;
    this.listeners = {};
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(data) { this.onmessage && this.onmessage({ data: JSON.stringify(data) }); }
  emitPing() { (this.listeners.ping || []).forEach(fn => fn({ data: '1' })); }
  emitError() { this.onerror && this.onerror(new Event('error')); }
  close() { this.closed = true; }
}
FakeEventSource.instances = [];

describe('useLeaderState', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens /host-events on mount and applies pushed state', () => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    const { result } = renderHook(() => useLeaderState(true));
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe('/host-events');
    expect(result.current).toBeNull();

    act(() => FakeEventSource.instances[0].emit({ phase: 'lobby', players: [] }));
    expect(result.current).toEqual({ phase: 'lobby', players: [] });
  });

  it('falls back to polling /api/host-state at 1500ms if nothing arrives within 4s', async () => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch({ '/api/host-state': { phase: 'day', players: [] } });
    const { result } = renderHook(() => useLeaderState(true));

    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(FakeEventSource.instances[0].closed).toBe(true);
    await waitFor(() => expect(result.current).toEqual({ phase: 'day', players: [] }));
    vi.useRealTimers();
  });

  it('falls back to polling immediately on a genuine connection error', async () => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch({ '/api/host-state': { phase: 'day', players: [] } });
    renderHook(() => useLeaderState(true));
    act(() => FakeEventSource.instances[0].emit({ phase: 'lobby', players: [] }));

    act(() => FakeEventSource.instances[0].emitError());
    expect(FakeEventSource.instances[0].closed).toBe(true);
    vi.useRealTimers();
  });

  it('closes the connection on unmount', () => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    const { unmount } = renderHook(() => useLeaderState(true));
    expect(FakeEventSource.instances[0].closed).toBe(false);
    unmount();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });
});

describe('isHostCodeError', () => {
  it('recognizes the exact host-code-required error', () => {
    expect(isHostCodeError({ error: 'Enter the host code first.' })).toBe(true);
  });

  it('is false for any other error, or no error at all', () => {
    expect(isHostCodeError({ error: 'Already executed (or decided not to) today.' })).toBe(false);
    expect(isHostCodeError({ ok: true })).toBe(false);
    expect(isHostCodeError(null)).toBe(false);
    expect(isHostCodeError(undefined)).toBe(false);
  });
});
