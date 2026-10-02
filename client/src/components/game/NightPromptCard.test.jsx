import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NightPromptCard from './NightPromptCard.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';

const basePrompt = {
  text: 'Choose a player to protect.',
  count: 1,
  targets: [{ id: 'p1', name: 'Bo' }, { id: 'p2', name: 'Cy' }],
  guessCharacter: false,
  optional: false,
};

describe('NightPromptCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the answered state once submitted, without the prompt UI', () => {
    render(<NightPromptCard P={{ prompt: basePrompt, submitted: true, watching: false, windowEndsAt: Date.now() + 20000 }} token="tok" />);
    expect(screen.getByText('Answered.')).toBeInTheDocument();
    expect(screen.queryByText('Choose a player to protect.')).not.toBeInTheDocument();
  });

  it('a watching (bot) seat shows disabled targets and no lock-in button', () => {
    render(<NightPromptCard P={{ prompt: basePrompt, submitted: false, watching: true, windowEndsAt: Date.now() + 20000 }} token="tok" />);
    expect(screen.getByText('Bo').closest('button')).toBeDisabled();
    expect(screen.queryByText(/lock in/i)).not.toBeInTheDocument();
    expect(screen.getByText(/waiting for the bot/i)).toBeInTheDocument();
  });

  it('names the exact pick in the Lock in button label, and posts on click', async () => {
    const fetchMock = mockFetch({ '/api/action': {} });
    render(<NightPromptCard P={{ prompt: basePrompt, submitted: false, watching: false, windowEndsAt: Date.now() + 20000 }} token="tok-1" />);
    const lockIn = screen.getByText('Lock in');
    expect(lockIn).toBeDisabled();

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByText('Bo'));
    expect(screen.getByText('Lock in Bo')).toBeEnabled();

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByText('Lock in Bo'));
    await waitFor(() => expect(lastBody(fetchMock, '/api/action')).toEqual({ token: 'tok-1', targets: ['p1'], characterGuess: null }));
  });

  it('a character-guess prompt requires both a target and a guess before it is ready, and names both', async () => {
    const prompt = { ...basePrompt, guessCharacter: true, characterOptions: [{ id: 'empath', name: 'Empath' }] };
    mockFetch({ '/api/action': {} });
    render(<NightPromptCard P={{ prompt, submitted: false, watching: false, windowEndsAt: Date.now() + 20000 }} token="tok-1" />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Bo'));
    expect(screen.getByText('Lock in')).toBeDisabled();
    await user.click(screen.getByText('Empath'));
    expect(screen.getByText('Lock in Bo — Empath')).toBeEnabled();
  });

  it('a character-only prompt (no player target) names just the guess, with no dangling separator', async () => {
    const prompt = { ...basePrompt, count: 0, targets: [], guessCharacter: true, characterOptions: [{ id: 'empath', name: 'Empath' }] };
    render(<NightPromptCard P={{ prompt, submitted: false, watching: false, windowEndsAt: Date.now() + 20000 }} token="tok-1" />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Empath'));
    expect(screen.getByText('Lock in Empath')).toBeInTheDocument();
  });

  it('an optional prompt offers Pass, which submits with no targets', async () => {
    const fetchMock = mockFetch({ '/api/action': {} });
    const prompt = { ...basePrompt, optional: true };
    render(<NightPromptCard P={{ prompt, submitted: false, watching: false, windowEndsAt: Date.now() + 20000 }} token="tok-1" />);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByText(/pass/i));
    await waitFor(() => expect(lastBody(fetchMock, '/api/action')).toEqual({ token: 'tok-1', targets: [], characterGuess: null }));
  });

  it('the clock counts down and turns urgent at 10s or under', () => {
    render(<NightPromptCard P={{ prompt: basePrompt, submitted: false, watching: false, windowEndsAt: Date.now() + 8000 }} token="tok" />);
    const clock = screen.getByText('8');
    expect(clock).toHaveClass('clock', 'urgent');
  });

  it('auto-submits whatever is missing once the window expires and the player has not locked in', async () => {
    const fetchMock = mockFetch({ '/api/action': {} });
    render(<NightPromptCard P={{ prompt: basePrompt, submitted: false, watching: false, windowEndsAt: Date.now() + 1000 }} token="tok-1" />);

    await vi.advanceTimersByTimeAsync(1100);
    await waitFor(() => {
      const body = lastBody(fetchMock, '/api/action');
      expect(body).toBeDefined();
      expect(body.token).toBe('tok-1');
      expect(body.targets).toHaveLength(1);
      expect(['p1', 'p2']).toContain(body.targets[0]);
    });
  });

  it('a manual lock-in right at the deadline is not overwritten by a stray auto-submit tick before P.submitted catches up', async () => {
    // The real-world race: the manual POST resolves (clearing local
    // picked/guessedCharacter state) before the next server push has had a
    // chance to flip P.submitted back to true — P here deliberately stays
    // submitted:false the whole test, simulating exactly that lag window.
    const fetchMock = mockFetch({ '/api/action': {} });
    render(<NightPromptCard P={{ prompt: basePrompt, submitted: false, watching: false, windowEndsAt: Date.now() + 1000 }} token="tok-1" />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Bo'));
    await user.click(screen.getByText('Lock in Bo'));
    await waitFor(() => expect(lastBody(fetchMock, '/api/action')).toEqual({ token: 'tok-1', targets: ['p1'], characterGuess: null }));

    // The window has now closed, and local state was cleared by the
    // successful submit above — without the fix, the next interval tick
    // would see an empty `picked` and fire a random second submission.
    await vi.advanceTimersByTimeAsync(1500);
    const calls = fetchMock.calls.filter(c => c.url.includes('/api/action'));
    expect(calls).toHaveLength(1);
  });

  it('does not auto-submit twice even if the interval keeps ticking after the window closes', async () => {
    const fetchMock = mockFetch({ '/api/action': {} });
    render(<NightPromptCard P={{ prompt: basePrompt, submitted: false, watching: false, windowEndsAt: Date.now() + 1000 }} token="tok-1" />);
    await vi.advanceTimersByTimeAsync(1100);
    await waitFor(() => expect(lastBody(fetchMock, '/api/action')).toBeDefined());
    const callsAfterFirst = fetchMock.calls.filter(c => c.url.includes('/api/action')).length;
    await vi.advanceTimersByTimeAsync(3000);
    const callsAfterMore = fetchMock.calls.filter(c => c.url.includes('/api/action')).length;
    expect(callsAfterMore).toBe(callsAfterFirst);
  });

  describe('the Barber-swap addon (prompt.barberSwap)', () => {
    const swapPrompt = {
      ...basePrompt,
      barberSwap: {
        definite: false,
        text: "If the Barber ends up dead by dawn, choose 2 players to swap.",
        targets: [{ id: 'p3', name: 'Di' }, { id: 'p4', name: 'Ed' }, { id: 'p5', name: 'Fen' }],
      },
    };

    it('is not shown at all when the prompt has no addon', () => {
      render(<NightPromptCard P={{ prompt: basePrompt, submitted: false, watching: false, windowEndsAt: Date.now() + 20000 }} token="tok" />);
      expect(screen.queryByText(/choose 2 players to swap/i)).not.toBeInTheDocument();
    });

    it('a real submission never includes barberSwapTargets at all when the addon is absent', async () => {
      const fetchMock = mockFetch({ '/api/action': {} });
      render(<NightPromptCard P={{ prompt: basePrompt, submitted: false, watching: false, windowEndsAt: Date.now() + 20000 }} token="tok-1" />);
      await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByText('Bo'));
      await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByText('Lock in Bo'));
      await waitFor(() => expect(lastBody(fetchMock, '/api/action')).toEqual({ token: 'tok-1', targets: ['p1'], characterGuess: null }));
    });

    it('shows the addon\'s own text and target list alongside the primary choice', () => {
      render(<NightPromptCard P={{ prompt: swapPrompt, submitted: false, watching: false, windowEndsAt: Date.now() + 20000 }} token="tok" />);
      expect(screen.getByText(swapPrompt.barberSwap.text)).toBeInTheDocument();
      expect(screen.getByText('Di')).toBeInTheDocument();
      expect(screen.getByText('Ed')).toBeInTheDocument();
    });

    it('Lock in stays disabled with exactly one swap target picked — 0 or 2, never partial', async () => {
      mockFetch({ '/api/action': {} });
      render(<NightPromptCard P={{ prompt: swapPrompt, submitted: false, watching: false, windowEndsAt: Date.now() + 20000 }} token="tok-1" />);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByText('Bo')); // primary choice, satisfies count:1
      await user.click(screen.getByText('Di')); // one of two swap targets
      // Not ready overall (the swap half is incomplete), even though the
      // primary choice alone is — the label falls back to plain "Lock in"
      // exactly the way it does before ANY primary pick is made.
      expect(screen.getByText('Lock in')).toBeDisabled();
    });

    it('Lock in re-enables once a full pair (or none) is picked, and posts barberSwapTargets alongside the primary choice', async () => {
      const fetchMock = mockFetch({ '/api/action': {} });
      render(<NightPromptCard P={{ prompt: swapPrompt, submitted: false, watching: false, windowEndsAt: Date.now() + 20000 }} token="tok-1" />);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByText('Bo'));
      await user.click(screen.getByText('Di'));
      await user.click(screen.getByText('Ed'));
      const lockIn = await screen.findByText('Lock in Bo');
      expect(lockIn).toBeEnabled();
      await user.click(lockIn);
      await waitFor(() => expect(lastBody(fetchMock, '/api/action'))
        .toEqual({ token: 'tok-1', targets: ['p1'], characterGuess: null, barberSwapTargets: ['p3', 'p4'] }));
    });

    it('a third click on a different target is simply ignored, capped at 2 — same as the primary target picker\'s own count cap', async () => {
      mockFetch({ '/api/action': {} });
      render(<NightPromptCard P={{ prompt: swapPrompt, submitted: false, watching: false, windowEndsAt: Date.now() + 20000 }} token="tok-1" />);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByText('Di'));
      await user.click(screen.getByText('Ed'));
      await user.click(screen.getByText('Fen'));
      // Still exactly the first 2 selected (Di, Ed) — Fen was never added.
      expect(screen.getByText('Di').closest('button')).toHaveClass('on');
      expect(screen.getByText('Ed').closest('button')).toHaveClass('on');
      expect(screen.getByText('Fen').closest('button')).not.toHaveClass('on');
    });

    it('an incomplete swap pick (1 of 2) is dropped to a pass on auto-submit, never forced to a random second pick', async () => {
      const fetchMock = mockFetch({ '/api/action': {} });
      render(<NightPromptCard P={{ prompt: swapPrompt, submitted: false, watching: false, windowEndsAt: Date.now() + 1000 }} token="tok-1" />);
      await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByText('Di'));
      await vi.advanceTimersByTimeAsync(1100);
      await waitFor(() => {
        const body = lastBody(fetchMock, '/api/action');
        expect(body).toBeDefined();
        expect(body.barberSwapTargets).toEqual([]);
      });
    });
  });
});
