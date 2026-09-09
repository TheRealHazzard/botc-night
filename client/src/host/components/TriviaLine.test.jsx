import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TriviaLine from './TriviaLine.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

// useTrivia() caches its fetch at module scope for this whole test file,
// not per-test — one shared fixture, with enough facts per script to cover
// every scenario below via scriptId choice alone, rather than swapping the
// mocked data per test (which the cache would just ignore after the first
// real fetch).
const TRIVIA = [
  { fact: 'The first Trouble Brewing fact.', scripts: ['tb'] },
  { fact: 'The second Trouble Brewing fact.', scripts: ['tb'] },
  { fact: 'The one Bad Moon Rising fact.', scripts: ['bmr'] },
];

describe('TriviaLine', () => {
  beforeEach(() => mockFetch({ '/trivia.json': TRIVIA }));
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
});
