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
});
