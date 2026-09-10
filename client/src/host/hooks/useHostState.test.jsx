import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useHostState } from './useHostState.js';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';

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
  removeEventListener(type, fn) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter(f => f !== fn);
  }
  emit(data) { this.onmessage && this.onmessage({ data: JSON.stringify(data) }); }
  emitPing() { (this.listeners.ping || []).forEach(fn => fn({ data: '1' })); }
  emitError() { this.onerror && this.onerror(new Event('error')); }
  close() { this.closed = true; }
}
FakeEventSource.instances = [];

// No StrictMode wrapper here: patchConfig's own "does it double-fire" risk
// is the same class of bug useTableState's castVote fix caught (a side
// effect called *from inside* a setState updater) — patchConfig never does
// that (see useHostState.js's comment), so it isn't sensitive to
// StrictMode's mount/effect double-invocation the way that bug class is.
// Wrapping in StrictMode here would only add an unrelated wrinkle: a second
// EventSource instance from the discarded first mount.
describe('useHostState', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens /host-events on mount and applies pushed state', () => {
    const { result } = renderHook(() => useHostState());
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe('/host-events');
    expect(result.current.S).toBeNull();

    act(() => FakeEventSource.instances[0].emit({ phase: 'lobby', players: [] }));
    expect(result.current.S).toEqual({ phase: 'lobby', players: [] });
  });

  it('falls back to polling /api/host-state at 1500ms if nothing arrives within 4s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch({ '/api/host-state': { phase: 'day', players: [] } });
    const { result } = renderHook(() => useHostState());

    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(FakeEventSource.instances[0].closed).toBe(true);
    await waitFor(() => expect(result.current.S).toEqual({ phase: 'day', players: [] }));
    vi.useRealTimers();
  });

  it('does not fall back to polling once a real message has arrived', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = mockFetch({ '/api/host-state': { phase: 'day', players: [] } });
    renderHook(() => useHostState());
    act(() => FakeEventSource.instances[0].emit({ phase: 'lobby', players: [] }));

    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(FakeEventSource.instances[0].closed).toBe(false);
    expect(fetchMock.calls.some(c => c.url.includes('/api/host-state'))).toBe(false);
    vi.useRealTimers();
  });

  it('falls back to polling immediately on a genuine connection error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch({ '/api/host-state': { phase: 'day', players: [] } });
    const { result } = renderHook(() => useHostState());
    act(() => FakeEventSource.instances[0].emit({ phase: 'lobby', players: [] }));

    act(() => FakeEventSource.instances[0].emitError());
    expect(FakeEventSource.instances[0].closed).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    await waitFor(() => expect(result.current.S).toEqual({ phase: 'day', players: [] }));
    vi.useRealTimers();
  });

  it('falls back to polling if the server keep-alive pings stop arriving mid-game', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch({ '/api/host-state': { phase: 'day', players: [] } });
    const { result } = renderHook(() => useHostState());
    act(() => FakeEventSource.instances[0].emit({ phase: 'lobby', players: [] }));

    // A ping just before 65s of total silence keeps the connection trusted.
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    act(() => FakeEventSource.instances[0].emitPing());
    expect(FakeEventSource.instances[0].closed).toBe(false);

    // But 65s of total silence (no message, no ping) after that is stale.
    await act(async () => { await vi.advanceTimersByTimeAsync(70000); });
    expect(FakeEventSource.instances[0].closed).toBe(true);
    await waitFor(() => expect(result.current.S).toEqual({ phase: 'day', players: [] }));
    vi.useRealTimers();
  });

  it('patchConfig posts exactly once and folds the merged config into S', async () => {
    const fetchMock = mockFetch({ '/api/table/config': { config: { windowSeconds: 90 } } });
    const { result } = renderHook(() => useHostState());
    act(() => FakeEventSource.instances[0].emit({ phase: 'lobby', config: { windowSeconds: 60 } }));

    await act(async () => { await result.current.patchConfig({ windowSeconds: 90 }); });

    expect(result.current.S.config).toEqual({ windowSeconds: 90 });
    const patchCalls = fetchMock.calls.filter(c => c.url.includes('/api/table/config'));
    expect(patchCalls).toHaveLength(1);
    expect(lastBody(fetchMock, '/api/table/config')).toEqual({ config: { windowSeconds: 90 } });
  });

  it('patchConfig leaves S.config alone on an error response', async () => {
    mockFetch({ '/api/table/config': { error: 'Game already started.' } });
    const { result } = renderHook(() => useHostState());
    act(() => FakeEventSource.instances[0].emit({ phase: 'day', config: { windowSeconds: 60 } }));

    const response = await act(async () => result.current.patchConfig({ windowSeconds: 90 }));
    expect(response.error).toBe('Game already started.');
    expect(result.current.S.config).toEqual({ windowSeconds: 60 });
  });
});
