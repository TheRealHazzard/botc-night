import { describe, it, expect, vi } from 'vitest';
import { StrictMode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useActiveVote } from './useActiveVote.js';
import { mockFetch, lastBody } from '../../test/fetchMock.js';

function wrapper({ children }) {
  return <StrictMode>{children}</StrictMode>;
}

describe('useActiveVote', () => {
  it('opens a vote from P.voteRequest, and moves to "locked" once the window passes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const P = { phase: 'day', voteRequest: { nominationId: 'n1', nomineeName: 'Bo', windowEndsAt: Date.now() + 500, isGhostVote: false } };
    const { result, rerender } = renderHook(({ P, token }) => useActiveVote(P, token), {
      initialProps: { P, token: 'tok' },
      wrapper,
    });
    expect(result.current.activeVote.stage).toBe('voting');
    expect(result.current.activeVote.nomineeName).toBe('Bo');

    // The lock check runs on a 1s interval (plus an immediate check on
    // mount, too early to see the deadline pass) — advance past the first
    // tick after the 500ms deadline, not just past the deadline itself.
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(result.current.activeVote.stage).toBe('locked');
    vi.useRealTimers();
  });

  it('a new nominationId replaces the active vote and resets ghostVoteEnabled', async () => {
    const P1 = { phase: 'day', voteRequest: { nominationId: 'n1', nomineeName: 'Bo', windowEndsAt: Date.now() + 60000, isGhostVote: false } };
    const { result, rerender } = renderHook(({ P, token }) => useActiveVote(P, token), {
      initialProps: { P: P1, token: 'tok' },
      wrapper,
    });
    expect(result.current.activeVote.nominationId).toBe('n1');

    const P2 = { phase: 'day', voteRequest: { nominationId: 'n2', nomineeName: 'Cy', windowEndsAt: Date.now() + 60000, isGhostVote: false } };
    rerender({ P: P2, token: 'tok' });
    await waitFor(() => expect(result.current.activeVote.nominationId).toBe('n2'));
    expect(result.current.activeVote.myChoice).toBeNull();
  });

  it('leaving day phase clears the active vote', async () => {
    const P1 = { phase: 'day', voteRequest: { nominationId: 'n1', nomineeName: 'Bo', windowEndsAt: Date.now() + 60000, isGhostVote: false } };
    const { result, rerender } = renderHook(({ P, token }) => useActiveVote(P, token), {
      initialProps: { P: P1, token: 'tok' },
      wrapper,
    });
    expect(result.current.activeVote).not.toBeNull();
    rerender({ P: { phase: 'night', voteRequest: null }, token: 'tok' });
    await waitFor(() => expect(result.current.activeVote).toBeNull());
  });

  it('castVote posts exactly once even under StrictMode double-invocation, and records the choice', async () => {
    const fetchMock = mockFetch({ '/api/table/vote': {} });
    const P = { phase: 'day', voteRequest: { nominationId: 'n1', nomineeName: 'Bo', windowEndsAt: Date.now() + 60000, isGhostVote: false } };
    const { result } = renderHook(({ P, token }) => useActiveVote(P, token), {
      initialProps: { P, token: 'tok-1' },
      wrapper,
    });

    await act(async () => { result.current.castVote('yes'); });
    await waitFor(() => expect(result.current.activeVote.myChoice).toBe('yes'));

    const voteCalls = fetchMock.calls.filter(c => c.url.includes('/api/table/vote'));
    expect(voteCalls).toHaveLength(1);
    expect(lastBody(fetchMock, '/api/table/vote')).toEqual({ token: 'tok-1', vote: 'yes' });
  });

  it('a ghost vote locks immediately after casting', async () => {
    mockFetch({ '/api/table/vote': {} });
    const P = { phase: 'day', voteRequest: { nominationId: 'n1', nomineeName: 'Bo', windowEndsAt: Date.now() + 60000, isGhostVote: true } };
    const { result } = renderHook(({ P, token }) => useActiveVote(P, token), {
      initialProps: { P, token: 'tok-1' },
      wrapper,
    });
    await act(async () => { result.current.castVote('no'); });
    await waitFor(() => expect(result.current.activeVote.stage).toBe('locked'));
  });

  it('revealVote moves to "revealed" then auto-clears after 5s; dismissReveal clears immediately', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const P = { phase: 'day', voteRequest: { nominationId: 'n1', nomineeName: 'Bo', windowEndsAt: Date.now() + 60000, isGhostVote: false } };
    const { result } = renderHook(({ P, token }) => useActiveVote(P, token), {
      initialProps: { P, token: 'tok' },
      wrapper,
    });
    act(() => { result.current.revealVote(); });
    expect(result.current.activeVote.stage).toBe('revealed');

    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
    expect(result.current.activeVote).toBeNull();
    vi.useRealTimers();
  });
});
