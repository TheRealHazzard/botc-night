import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SessionShareCard from './SessionShareCard.jsx';

const players = [
  { id: 'slayer1', name: 'Fay', character: 'Slayer' },
  { id: 'imp1', name: 'Cass', character: 'Imp' },
];

describe('SessionShareCard', () => {
  it('shows session tallies and both highlights when available', () => {
    const pivotalHighlights = {
      playOfTheGame: { type: 'slayer-attempt', playerId: 'slayer1', targetId: 'imp1', impaired: true, targetWasDemon: true },
      gameWinningNomination: null,
      mvp: { playerId: 'slayer1', score: 1, topEvent: { type: 'blocked-kill', reason: 'soldier', playerId: 'slayer1', targetId: 'slayer1' } },
    };
    render(<SessionShareCard session={{ gamesPlayed: 3, goodWins: 2, evilWins: 1 }} pivotalHighlights={pivotalHighlights} players={players} />);
    expect(screen.getByText('Blood on the Clocktower')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Games')).toBeInTheDocument();
    expect(screen.getByText('Play of the Game')).toBeInTheDocument();
    expect(screen.getByText('Fay was poisoned — and still put a bolt through the Demon.')).toBeInTheDocument();
    expect(screen.getByText('MVP — Fay — Slayer')).toBeInTheDocument();
    expect(screen.getByText("Fay took a Demon's attack meant to kill them, and walked away.")).toBeInTheDocument();
  });

  it('a single-game session says "Game", not "Games"', () => {
    render(<SessionShareCard session={{ gamesPlayed: 1, goodWins: 1, evilWins: 0 }} pivotalHighlights={null} players={players} />);
    expect(screen.getByText('Game')).toBeInTheDocument();
  });

  it('renders cleanly with no highlights at all (a quiet game, no drama)', () => {
    render(<SessionShareCard session={{ gamesPlayed: 1, goodWins: 0, evilWins: 1 }} pivotalHighlights={{ playOfTheGame: null, gameWinningNomination: null, mvp: null }} players={players} />);
    expect(screen.queryByText('Play of the Game')).not.toBeInTheDocument();
    expect(screen.queryByText(/MVP/)).not.toBeInTheDocument();
  });
});
