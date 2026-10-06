import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TriviaLine from './TriviaLine.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

// useTrivia() AND useTokens() both cache their fetch at module scope for
// this whole test file, not per-test — one shared fixture each, with
// enough variety to cover every scenario below via scriptId choice alone,
// rather than swapping the mocked data per test (which the cache would
// just ignore after the first real fetch). Only 'imp' has art in the
// token fixture, deliberately — 'recluse' stays unmapped so there's a
// real "named a character, but no art for it" case to test against.
const TRIVIA = [
  { fact: 'The first Trouble Brewing fact.', scripts: ['tb'] },
  { fact: 'The second Trouble Brewing fact.', scripts: ['tb'] },
  { fact: 'The one Bad Moon Rising fact.', scripts: ['bmr'], character: 'imp' },
  { fact: 'The one fact naming a character with no art.', scripts: ['xyz'], character: 'recluse' },
];

describe('TriviaLine', () => {
  beforeEach(() => mockFetch({ '/trivia.json': TRIVIA, '/api/tokens': { imp: '/tokens/imp.png' } }));
  afterEach(() => vi.restoreAllMocks());

  it('renders nothing when there is nothing eligible for the current script', async () => {
    const { container } = render(<TriviaLine scriptId="sv" />);
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows the one eligible fact for a script with only one', async () => {
    render(<TriviaLine scriptId="bmr" />);
    expect(await screen.findByText(/bad moon rising fact/i)).toBeInTheDocument();
  });

  it('switches to the newly-eligible fact the instant the script changes — not waiting for the 14s timer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { rerender } = render(<TriviaLine scriptId="tb" />);
    await vi.waitFor(() => expect(screen.getByText(/trouble brewing fact/i)).toBeInTheDocument());

    rerender(<TriviaLine scriptId="bmr" />);
    // No timer advance at all — the correction must be synchronous with the prop change.
    expect(screen.getByText(/bad moon rising fact/i)).toBeInTheDocument();
    expect(screen.queryByText(/trouble brewing fact/i)).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('rerolls to a different fact after 14 seconds even with no prop change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<TriviaLine scriptId="tb" />);
    await vi.waitFor(() => expect(screen.getByText(/trouble brewing fact/i)).toBeInTheDocument());
    const firstShown = screen.getByText(/trouble brewing fact/i).textContent;

    await vi.advanceTimersByTimeAsync(14100);
    const secondShown = screen.getByText(/trouble brewing fact/i).textContent;
    expect(secondShown).not.toBe(firstShown);
    vi.useRealTimers();
  });

  it("shows the named character's own token image in place of the plain icon, when its art exists", async () => {
    const { container } = render(<TriviaLine scriptId="bmr" />);
    await screen.findByText(/bad moon rising fact/i);
    const token = container.querySelector('.trivia-card-token');
    expect(token).toHaveAttribute('src', '/tokens/imp.png');
    expect(container.querySelector('.icon')).not.toBeInTheDocument();
  });

  it('falls back to the plain bulb icon when the named character has no art available', async () => {
    const { container } = render(<TriviaLine scriptId="xyz" />);
    await screen.findByText(/no art/i);
    expect(container.querySelector('.trivia-card-token')).not.toBeInTheDocument();
    expect(container.querySelector('.icon')).toBeInTheDocument();
  });

  it('shows the plain bulb icon for a fact that names no character at all', async () => {
    const { container } = render(<TriviaLine scriptId="tb" />);
    await vi.waitFor(() => expect(screen.getByText(/trouble brewing fact/i)).toBeInTheDocument());
    expect(container.querySelector('.trivia-card-token')).not.toBeInTheDocument();
    expect(container.querySelector('.icon')).toBeInTheDocument();
  });
});
