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
  }
  emit(data) { this.onmessage && this.onmessage({ data: JSON.stringify(data) }); }
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

  it('a dead token (404 on /events) forgets the token instead of reloading the page', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ status: 404, json: () => Promise.resolve({}) }));
    const { result } = renderHook(() => useTableState());
    act(() => result.current.setToken('dead-tok'));
    act(() => FakeEventSource.instances[0].error());
    await waitFor(() => expect(result.current.token).toBeNull());
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
