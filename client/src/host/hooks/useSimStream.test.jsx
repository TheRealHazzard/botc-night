import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSimStream } from './useSimStream.js';
import { mockFetch } from '../../../test/fetchMock.js';

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

describe('useSimStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    FakeEventSource.instances = [];
  });

  it('probes /sim-events first, and connects once the probe succeeds (a sim is already running)', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    mockFetch({ '/sim-events': {} });
    const { result } = renderHook(() => useSimStream());
    expect(result.current.payload).toBeNull();

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(FakeEventSource.instances[0].url).toBe('/sim-events');

    act(() => FakeEventSource.instances[0].emit({ table: { phase: 'night' }, seats: [] }));
    expect(result.current.payload).toEqual({ table: { phase: 'night' }, seats: [] });
  });

  it('never opens an EventSource when the probe fails (no simulation running)', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    globalThis.fetch = () => Promise.resolve({ ok: false, status: 403 });
    const { result } = renderHook(() => useSimStream());

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current.payload).toBeNull();
  });

  it('reconnect() re-probes and opens a fresh connection, for the start form to call after POST /api/sim/start', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    let simRunning = false;
    globalThis.fetch = url =>
      String(url).includes('/sim-events')
        ? Promise.resolve({ ok: simRunning, status: simRunning ? 200 : 403 })
        : Promise.resolve({ ok: true, json: () => Promise.resolve({}) });

    const { result } = renderHook(() => useSimStream());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(FakeEventSource.instances).toHaveLength(0);

    simRunning = true;
    act(() => result.current.reconnect());
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
  });

  it('falls back to polling /api/sim-state if nothing arrives within 4s of connecting', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('EventSource', FakeEventSource);
    mockFetch({ '/sim-events': {}, '/api/sim-state': { table: { phase: 'day' }, seats: [] } });
    const { result } = renderHook(() => useSimStream());

    await act(async () => { await vi.advanceTimersByTimeAsync(100); }); // let the probe resolve
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    await act(async () => { await vi.advanceTimersByTimeAsync(4200); });
    expect(FakeEventSource.instances[0].closed).toBe(true);
    await waitFor(() => expect(result.current.payload).toEqual({ table: { phase: 'day' }, seats: [] }));
  });

  it('closes the EventSource and stops polling on unmount', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    mockFetch({ '/sim-events': {} });
    const { unmount } = renderHook(() => useSimStream());
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    unmount();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });
});
