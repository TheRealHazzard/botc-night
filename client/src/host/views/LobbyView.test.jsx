import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LobbyView from './LobbyView.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

// Start Game/Clear the lobby/Game history now live in the header, not here
// — see App.test.jsx for their behavior. LobbyView's own tests just need to
// confirm this panel stays button-free.

const scripts = [
  {
    id: 'tb', name: 'Trouble Brewing', difficulty: 1, playable: true, description: 'x', decidedGames: 0,
    characters: [{ id: 'washerwoman', name: 'Washerwoman', team: 'townsfolk' }, { id: 'imp', name: 'Imp', team: 'demon' }],
  },
  { id: 'bmr', name: 'Bad Moon Rising', difficulty: 2, playable: true, description: 'x', decidedGames: 0 },
  { id: 'lunar-eclipse', name: 'Lunar Eclipse', difficulty: 4, playable: false, description: 'x', decidedGames: 0 },
];

function baseProps(overrides = {}) {
  return {
    players: [], script: 'tb', scripts,
    browsing: false, browseIndex: 0, browsedMeta: false,
    onBrowse: () => {}, onEnterBrowse: () => {},
    ...overrides,
  };
}

describe('LobbyView', () => {
  beforeEach(() => {
    mockFetch({ '/api/tokens': {}, '/trivia.json': [], '/api/join-address': { url: 'http://192.168.1.5:3000' } });
    delete window.QRCodeGen;
  });
  afterEach(() => { delete window.QRCodeGen; });

  it('an empty lobby shows "still empty" and no seat count, and no Start/Clear/History buttons of its own', () => {
    render(<LobbyView {...baseProps()} />);
    expect(screen.getByText('The town is still empty.')).toBeInTheDocument();
    expect(screen.getByText(/open that address/i)).toBeInTheDocument();
    expect(screen.queryByTitle('Start Game')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/clear the lobby/i)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/game history/i)).not.toBeInTheDocument();
  });

  it('shows the current script in the view panel, and Change script calls onEnterBrowse', async () => {
    const onEnterBrowse = vi.fn();
    render(<LobbyView {...baseProps({ onEnterBrowse })} />);
    expect(screen.getByText('Trouble Brewing')).toBeInTheDocument();
    await userEvent.click(screen.getByText(/change script/i));
    expect(onEnterBrowse).toHaveBeenCalledTimes(1);
  });

  it('shows the join address once resolved, falling back to "finding the address…" first', async () => {
    render(<LobbyView {...baseProps()} />);
    expect(await screen.findByText('http://192.168.1.5:3000')).toBeInTheDocument();
  });

  describe('browsing takes over all three panels, not just the left one', () => {
    const players = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, alive: true, connected: true, color: null }));

    it('while browsing: center shows the big preview, right shows the roster — no ring/QR', () => {
      render(<LobbyView {...baseProps({ players, browsing: true, browseIndex: 0, browsedMeta: scripts[0] })} />);

      // Left: still the list, showing every script including ones not browsed yet.
      expect(screen.getByText('Bad Moon Rising')).toBeInTheDocument();
      // Center: ring/trivia/seated-count gone, replaced by the browsed script's preview.
      expect(screen.queryByText('The town gathers.')).not.toBeInTheDocument();
      expect(screen.queryByText(/seated/)).not.toBeInTheDocument();
      expect(screen.getAllByText('Trouble Brewing').length).toBeGreaterThan(0); // list row + center preview heading
      // Right: the Join Here/QR card is gone, replaced by the playable-character roster.
      expect(screen.queryByText(/join here/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/choose trouble brewing/i)).not.toBeInTheDocument();
      expect(screen.getByText('In this script (2)')).toBeInTheDocument();
      expect(screen.getByText('Washerwoman')).toBeInTheDocument();
    });

    it('clicking a different row calls onBrowse with its index', async () => {
      const onBrowse = vi.fn();
      render(<LobbyView {...baseProps({ players, browsing: true, browseIndex: 0, browsedMeta: scripts[0], onBrowse })} />);
      await userEvent.click(screen.getByText('Bad Moon Rising'));
      expect(onBrowse).toHaveBeenCalledWith(1);
    });

    it('not browsing (browsedMeta false) restores the normal ring+QR view even with players seated', () => {
      render(<LobbyView {...baseProps({ players, browsing: false, browsedMeta: false })} />);
      expect(screen.getByText('The town gathers.')).toBeInTheDocument();
      expect(screen.getByText(/join here/i)).toBeInTheDocument();
    });

    it('a locked browsed script still shows its roster (locked only affects the header\'s Choose button)', () => {
      render(<LobbyView {...baseProps({ players, browsing: true, browseIndex: 2, browsedMeta: scripts[2] })} />);
      // Appears twice — the list row and the center preview heading.
      expect(screen.getAllByText('Lunar Eclipse').length).toBe(2);
      expect(screen.getAllByText('Soon').length).toBeGreaterThanOrEqual(1); // list row's own tag (+ preview badge)
    });
  });
});
