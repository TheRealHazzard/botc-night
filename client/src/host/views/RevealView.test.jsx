import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RevealView from './RevealView.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

const players = [{ id: 'p1', name: 'Ada', alive: true, connected: true, color: null }];
const activeScriptMeta = { id: 'tb', name: 'Trouble Brewing', difficulty: 1, description: 'x', decidedGames: 0 };

describe('RevealView', () => {
  beforeEach(() => mockFetch({ '/api/tokens': {} }));

  it('shows the reveal narration and the seating ring', () => {
    render(<RevealView players={players} scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    expect(screen.getByText('Look at your hands.')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('shows the controls plainly on the right, not just behind the collapsed drawer', () => {
    render(<RevealView players={players} scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    // The persistent right-side panel's copy is visible immediately — this
    // is the fix, controls used to be reachable only by opening the
    // drawer. The drawer's own copy isn't in the DOM until tapped open
    // (still available there too, for a phone driving this same screen via
    // the leader overlay), so there's exactly one match so far.
    expect(screen.getAllByText(/night falls/i)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Storyteller controls' })).toBeInTheDocument();
  });

  it('Night falls posts /api/table/night', async () => {
    const fetchMock = mockFetch({ '/api/tokens': {}, '/api/table/night': {} });
    render(<RevealView players={players} scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    await userEvent.click(screen.getAllByText(/night falls/i)[0]);
    expect(fetchMock.calls.some(c => c.url.includes('/api/table/night'))).toBe(true);
  });

  it('Reveal and New game confirm before posting', async () => {
    const fetchMock = mockFetch({ '/api/tokens': {}, '/api/table/reveal': {} });
    window.confirm = vi.fn(() => false);
    render(<RevealView players={players} scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    await userEvent.click(screen.getAllByText('Reveal')[0]);
    expect(fetchMock.calls.some(c => c.url.includes('/api/table/reveal'))).toBe(false);
    window.confirm.mockReturnValue(true);
    await userEvent.click(screen.getAllByText('Reveal')[0]);
    expect(fetchMock.calls.some(c => c.url.includes('/api/table/reveal'))).toBe(true);
  });
});
