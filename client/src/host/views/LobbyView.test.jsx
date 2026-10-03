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
    players: [], script: 'tb', scripts, setupRatio: null,
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

  it('an empty lobby shows "open that address" on the Controls tab (Join Here), and no Start/Clear/History buttons of its own', async () => {
    render(<LobbyView {...baseProps()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Controls' }));
    expect(screen.getByText(/open that address/i)).toBeInTheDocument();
    expect(screen.queryByTitle('Start Game')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/clear the lobby/i)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/game history/i)).not.toBeInTheDocument();
  });

  // The ring-slot (App.jsx's portal target for the permanently-mounted
  // ring) must never unmount here, or the ring itself unmounts for real —
  // defeating the whole point of it living outside the phase views. An
  // empty lobby shows an empty ring rather than no ring at all; browsing
  // scripts hides it visually (the preview takes over this column) via a
  // class, not by dropping the slot.
  describe('the ring-slot stays mounted no matter what — hidden by class, never unmounted', () => {
    const players = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, alive: true, connected: true, color: null }));

    it('present, not hidden, with an empty lobby', () => {
      const { container } = render(<LobbyView {...baseProps()} />);
      const slot = container.querySelector('.ring-slot');
      expect(slot).toBeInTheDocument();
      expect(slot).not.toHaveClass('ring-slot-hidden');
    });

    it('present, not hidden, with players seated and not browsing', () => {
      const { container } = render(<LobbyView {...baseProps({ players })} />);
      const slot = container.querySelector('.ring-slot');
      expect(slot).toBeInTheDocument();
      expect(slot).not.toHaveClass('ring-slot-hidden');
    });

    it('present but hidden while browsing a script', () => {
      const { container } = render(<LobbyView {...baseProps({ players, browsing: true, browseIndex: 0, browsedMeta: scripts[0] })} />);
      const slot = container.querySelector('.ring-slot');
      expect(slot).toBeInTheDocument();
      expect(slot).toHaveClass('ring-slot-hidden');
    });
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
    // Join/QR now lives on the Controls tab, beside Script.
    await userEvent.click(screen.getByRole('button', { name: 'Controls' }));
    expect(await screen.findByText('http://192.168.1.5:3000')).toBeInTheDocument();
  });

  it('the add-bots card offers room up to the script\'s own cap, and disappears once the table is full', () => {
    const teensy = { id: 'teensy', name: 'Teensy', difficulty: 1, playable: true, description: 'x', decidedGames: 0, maxPlayers: 7 };
    const sevenPlayers = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, alive: true, connected: true, color: null }));
    render(<LobbyView {...baseProps({ players: sevenPlayers, script: 'teensy', scripts: [...scripts, teensy] })} />);
    expect(screen.queryByText(/short-handed/i)).not.toBeInTheDocument();
  });

  describe('setupRatio — the Townsfolk/Outsider/Minion/Demon reference for the seated count', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, alive: true, connected: true, color: null }));

    it('shows the ratio next to the seat count when one is given', async () => {
      render(<LobbyView {...baseProps({ players, setupRatio: { townsfolk: 5, outsider: 1, minion: 1, demon: 1 } })} />);
      await userEvent.click(screen.getByRole('button', { name: 'Controls' }));
      expect(screen.getByText('8 seated')).toBeInTheDocument();
      expect(screen.getByText(/5 Townsfolk/)).toBeInTheDocument();
      expect(screen.getByText(/1 Outsider ·/)).toBeInTheDocument(); // singular, not "1 Outsiders"
      expect(screen.getByText(/1 Minion ·/)).toBeInTheDocument();
      expect(screen.getByText(/1 Demon$/)).toBeInTheDocument();
    });

    it('pluralizes Outsiders/Minions/Demons when the count isn\'t 1', async () => {
      render(<LobbyView {...baseProps({ players, setupRatio: { townsfolk: 5, outsider: 2, minion: 2, demon: 1 } })} />);
      await userEvent.click(screen.getByRole('button', { name: 'Controls' }));
      expect(screen.getByText(/2 Outsiders/)).toBeInTheDocument();
      expect(screen.getByText(/2 Minions/)).toBeInTheDocument();
    });

    it('shows nothing extra when there is no ratio for the current count (outside 5-15)', async () => {
      const { container } = render(<LobbyView {...baseProps({ players, setupRatio: null })} />);
      await userEvent.click(screen.getByRole('button', { name: 'Controls' }));
      expect(screen.getByText('8 seated')).toBeInTheDocument();
      expect(container.querySelector('.setup-ratio')).not.toBeInTheDocument();
    });
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

    it('not browsing (browsedMeta false) restores the normal ring+QR view even with players seated', async () => {
      render(<LobbyView {...baseProps({ players, browsing: false, browsedMeta: false })} />);
      expect(document.querySelector('.ring-slot')).not.toHaveClass('ring-slot-hidden');
      await userEvent.click(screen.getByRole('button', { name: 'Controls' }));
      expect(screen.getByText(/join here/i)).toBeInTheDocument();
      expect(screen.getByText('3 seated')).toBeInTheDocument();
    });

    it('the "Short-handed?" add-bots card is gone while browsing, back once not', async () => {
      const { rerender } = render(<LobbyView {...baseProps({ players, browsing: true, browseIndex: 0, browsedMeta: scripts[0] })} />);
      expect(screen.queryByText(/short-handed/i)).not.toBeInTheDocument();

      rerender(<LobbyView {...baseProps({ players, browsing: false, browsedMeta: false })} />);
      await userEvent.click(screen.getByRole('button', { name: 'Controls' }));
      expect(screen.getByText(/short-handed/i)).toBeInTheDocument();
    });

    it('a locked browsed script still shows its roster (locked only affects the header\'s Choose button)', () => {
      render(<LobbyView {...baseProps({ players, browsing: true, browseIndex: 2, browsedMeta: scripts[2] })} />);
      // Appears twice — the list row and the center preview heading.
      expect(screen.getAllByText('Lunar Eclipse').length).toBe(2);
      expect(screen.getAllByText('Soon').length).toBeGreaterThanOrEqual(1); // list row's own tag (+ preview badge)
    });
  });
});
