import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTableState } from './useTableState.js';

const TOKEN_KEY = 'botc-player-token';

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
  error() { this.onerror && this.onerror(); }
  close() { this.closed = true; }
}
FakeEventSource.instances = [];

describe('useTableState', () => {
  beforeEach(() => {
    localStorage.clear();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts with whatever token is already in localStorage, and no player state', () => {
    localStorage.setItem(TOKEN_KEY, 'stored-tok');
    const { result } = renderHook(() => useTableState());
    expect(result.current.token).toBe('stored-tok');
    expect(result.current.P).toBeNull();
  });

  it('setToken persists to localStorage and opens an EventSource connection', () => {
    const { result } = renderHook(() => useTableState());
    act(() => result.current.setToken('new-tok'));
    expect(localStorage.getItem(TOKEN_KEY)).toBe('new-tok');
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toContain('new-tok');
  });

  it('applies player state pushed over the SSE connection', () => {
    const { result } = renderHook(() => useTableState());
    act(() => result.current.setToken('tok'));
    act(() => FakeEventSource.instances[0].emit({ phase: 'lobby', you: { name: 'Bo' } }));
    expect(result.current.P).toEqual({ phase: 'lobby', you: { name: 'Bo' } });
  });

  it('sets --personal-accent from the player\'s chosen color', () => {
    const { result } = renderHook(() => useTableState());
    act(() => result.current.setToken('tok'));
    act(() => FakeEventSource.instances[0].emit({ phase: 'lobby', you: { name: 'Bo', color: { hex: '#123456' } } }));
    expect(document.documentElement.style.getPropertyValue('--personal-accent')).toBe('#123456');
  });

  it('forgetToken clears both the stored token and P, for a caller-initiated "change user"', () => {
    const { result } = renderHook(() => useTableState());
    act(() => result.current.setToken('tok'));
    act(() => FakeEventSource.instances[0].emit({ phase: 'lobby', you: { name: 'Bo' } }));
    expect(result.current.token).toBe('tok');

    act(() => result.current.forgetToken());
    expect(result.current.token).toBeNull();
    expect(result.current.P).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('a dead token (404 on /events) forgets the token instead of reloading the page', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ status: 404, json: () => Promise.resolve({}) }));
    const { result } = renderHook(() => useTableState());
    act(() => result.current.setToken('dead-tok'));
    act(() => FakeEventSource.instances[0].error());
    await waitFor(() => expect(result.current.token).toBeNull());
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('a genuine connection error (token still valid) falls back to polling instead of forgetting the token', async () => {
    global.fetch = vi.fn(url => {
      if (String(url).includes('/events')) return Promise.resolve({ status: 200, json: () => Promise.resolve({}) });
      return Promise.resolve({ status: 200, json: () => Promise.resolve({ phase: 'day', you: { name: 'Bo' } }) });
    });
    const { result } = renderHook(() => useTableState());
    act(() => result.current.setToken('tok'));
    act(() => FakeEventSource.instances[0].emit({ phase: 'lobby', you: { name: 'Bo' } }));

    act(() => FakeEventSource.instances[0].error());
    await waitFor(() => expect(FakeEventSource.instances[0].closed).toBe(true));
    await waitFor(() => expect(result.current.P).toEqual({ phase: 'day', you: { name: 'Bo' } }));
    expect(result.current.token).toBe('tok');
  });

  it('falls back to polling if the server keep-alive pings stop arriving mid-game', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    global.fetch = vi.fn(() => Promise.resolve({ status: 200, json: () => Promise.resolve({ phase: 'day', you: { name: 'Bo' } }) }));
    const { result } = renderHook(() => useTableState());
    act(() => result.current.setToken('tok'));
    act(() => FakeEventSource.instances[0].emit({ phase: 'lobby', you: { name: 'Bo' } }));

    // A ping just before 65s of total silence keeps the connection trusted.
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    act(() => FakeEventSource.instances[0].emitPing());
    expect(FakeEventSource.instances[0].closed).toBe(false);

    // But 65s of total silence (no message, no ping) after that is stale.
    await act(async () => { await vi.advanceTimersByTimeAsync(70000); });
    expect(FakeEventSource.instances[0].closed).toBe(true);
    await waitFor(() => expect(result.current.P).toEqual({ phase: 'day', you: { name: 'Bo' } }));
    vi.useRealTimers();
  });
});
