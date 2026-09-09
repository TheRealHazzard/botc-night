import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JugglerGuess from './JugglerGuess.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';

const jugglerGuess = {
  targets: [{ id: 'p1', name: 'Bo' }, { id: 'p2', name: 'Cy' }],
  characterOptions: [{ id: 'empath', name: 'Empath' }, { id: 'imp', name: 'Imp' }],
};

describe('JugglerGuess', () => {
  it('submits with no guesses by default, labeled accordingly', async () => {
    const fetchMock = mockFetch({ '/api/juggler-guess': {} });
    render(<JugglerGuess jugglerGuess={jugglerGuess} token="tok-1" />);
    const submit = screen.getByText('Submit (no guesses)');
    await userEvent.click(submit);
    expect(lastBody(fetchMock, '/api/juggler-guess')).toEqual({ token: 'tok-1', guesses: [] });
  });

  it('builds a guess (player then character), lists it, and lets it be removed', async () => {
    render(<JugglerGuess jugglerGuess={jugglerGuess} token="tok-1" />);
    await userEvent.click(screen.getByText('Bo'));
    expect(screen.getByText(/now guess bo.s character/i)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Empath'));

    expect(screen.getByText(/Bo — Empath/)).toBeInTheDocument();
    expect(screen.getByText('Submit 1 guess')).toBeInTheDocument();
    // Bo is used now — only Cy remains offered for the next guess
    expect(screen.queryByText('Bo', { selector: 'button' })).not.toBeInTheDocument();

    const item = screen.getByText(/Bo — Empath/).closest('li');
    await userEvent.click(within(item).getByText('Remove'));
    expect(screen.queryByText(/Bo — Empath/)).not.toBeInTheDocument();
    expect(screen.getByText('Submit (no guesses)')).toBeInTheDocument();
  });

  it('"Cancel this guess" backs out of the character-pick step without adding one', async () => {
    render(<JugglerGuess jugglerGuess={jugglerGuess} token="tok-1" />);
    await userEvent.click(screen.getByText('Bo'));
    await userEvent.click(screen.getByText(/cancel this guess/i));
    expect(screen.getByText(/guess 1 of up to 5/i)).toBeInTheDocument();
    expect(screen.getByText('Submit (no guesses)')).toBeInTheDocument();
  });

  it('stops offering new guesses once 5 are made, and submits the full list', async () => {
    const targets = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    const chars = [{ id: 'c0', name: 'Char' }];
    const fetchMock = mockFetch({ '/api/juggler-guess': {} });
    render(<JugglerGuess jugglerGuess={{ targets, characterOptions: chars }} token="tok-1" />);
    for (let i = 0; i < 5; i++) {
      await userEvent.click(screen.getByText(`P${i}`));
      await userEvent.click(screen.getByText('Char'));
    }
    expect(screen.queryByText(/guess 6 of up to 5/i)).not.toBeInTheDocument();
    const submit = screen.getByText('Submit 5 guesses');
    await userEvent.click(submit);
    expect(lastBody(fetchMock, '/api/juggler-guess').guesses).toHaveLength(5);
  });
});
