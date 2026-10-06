import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PivotalMomentsCard from './PivotalMomentsCard.jsx';

const players = [
  { id: 'slayer1', name: 'Fay', character: 'Slayer' },
  { id: 'imp1', name: 'Cass', character: 'Imp' },
  { id: 'soldier1', name: 'Bo', character: 'Soldier' },
];

describe('PivotalMomentsCard', () => {
  it('renders nothing when there are no highlights at all', () => {
    const { container } = render(<PivotalMomentsCard players={players} pivotalHighlights={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when every highlight field is null', () => {
    const { container } = render(
      <PivotalMomentsCard players={players} pivotalHighlights={{ playOfTheGame: null, gameWinningNomination: null, mvp: null }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows all three cards, in order, for a game that has all three', () => {
    render(
      <PivotalMomentsCard
        players={players}
        pivotalHighlights={{
          playOfTheGame: { type: 'slayer-attempt', playerId: 'slayer1', targetId: 'imp1', impaired: true },
          gameWinningNomination: { nominatorId: 'soldier1', nomineeId: 'imp1', night: 3 },
          mvp: { playerId: 'slayer1', score: 1, topEvent: { type: 'slayer-attempt', playerId: 'slayer1', targetId: 'imp1', impaired: true } },
        }}
      />
    );
    const titles = screen.getAllByText(/Play of the Game|The nomination that ended it|MVP/);
    expect(titles.map(t => t.textContent)).toEqual([
      'Play of the Game — Fay',
      'The nomination that ended it — Bo → Cass',
      'MVP — Fay — Slayer',
    ]);
    expect(screen.getAllByText(/poisoned — and still put a bolt through the Demon/).length).toBeGreaterThan(0);
  });

  it('shows just the one card a game actually has', () => {
    render(
      <PivotalMomentsCard
        players={players}
        pivotalHighlights={{
          playOfTheGame: { type: 'slayer-attempt', playerId: 'slayer1', targetId: 'imp1', impaired: false },
          gameWinningNomination: null,
          mvp: null,
        }}
      />
    );
    expect(screen.getByText('Pivotal moments')).toBeInTheDocument();
    expect(screen.getByText('Play of the Game — Fay')).toBeInTheDocument();
    expect(screen.queryByText(/^MVP/)).not.toBeInTheDocument();
  });
});
