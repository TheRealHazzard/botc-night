import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useScriptRoster } from './useScriptRoster.js';

afterEach(() => vi.restoreAllMocks());

describe('useScriptRoster', () => {
  it('returns null then the fetched roster once /api/script resolves', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      json: () => Promise.resolve({ edition: 'tb', characters: [{ id: 'imp', name: 'Imp' }] }),
    }));
    const { result } = renderHook(() => useScriptRoster('tb'));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual([{ id: 'imp', name: 'Imp' }]));
  });

  it('a stale response for an earlier scriptId is discarded even if it resolves last', async () => {
    // /api/script has no scriptId param — it just returns whatever the
    // server currently has. Simulate the race directly: the fetch begun
    // for 'tb' resolves *after* the table has already moved on to 'bmr'.
    let resolveFirst;
    const firstResponse = new Promise(r => { resolveFirst = r; });
    let callCount = 0;
    global.fetch = vi.fn(() => {
      callCount++;
      if (callCount === 1) return firstResponse;
      return Promise.resolve({ json: () => Promise.resolve({ edition: 'bmr', characters: [{ id: 'butler', name: 'Butler' }] }) });
    });

    const { result, rerender } = renderHook(({ scriptId }) => useScriptRoster(scriptId), { initialProps: { scriptId: 'tb' } });
    rerender({ scriptId: 'bmr' });
    await waitFor(() => expect(result.current).toEqual([{ id: 'butler', name: 'Butler' }]));

    // The 'tb' fetch finally resolves, late, and stale — must not overwrite bmr's roster.
    resolveFirst({ json: () => Promise.resolve({ edition: 'tb', characters: [{ id: 'imp', name: 'Imp' }] }) });
    await new Promise(r => setTimeout(r, 0));
    expect(result.current).toEqual([{ id: 'butler', name: 'Butler' }]);
  });

  it('clears the previous script\'s roster to null the instant scriptId changes, not just once the new one resolves', async () => {
    let callCount = 0;
    global.fetch = vi.fn(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ json: () => Promise.resolve({ edition: 'tb', characters: [{ id: 'imp', name: 'Imp' }] }) });
      return new Promise(() => {}); // 'bmr' never resolves in this test
    });
    const { result, rerender } = renderHook(({ scriptId }) => useScriptRoster(scriptId), { initialProps: { scriptId: 'tb' } });
    await waitFor(() => expect(result.current).toEqual([{ id: 'imp', name: 'Imp' }]));

    rerender({ scriptId: 'bmr' });
    expect(result.current).toBeNull();
  });
});
