import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameSummaryCard from './GameSummaryCard.jsx';

describe('GameSummaryCard', () => {
  it('shows the game-wide stats, with a survived evil correctly worded', () => {
    const gs = {
      nominations: 4, voteAccuracy: 0.75, ghostVotesUsed: 1, ghostVotesEligible: 2,
      longestSurvivingEvil: { name: 'Bo', survived: true },
    };
    render(<GameSummaryCard gs={gs} />);
    expect(screen.getByText('This game')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('Bo — made it')).toBeInTheDocument();
  });

  it('a fallen evil names the night they fell; missing accuracy shows a dash', () => {
    const gs = {
      nominations: 0, voteAccuracy: null, ghostVotesUsed: 0, ghostVotesEligible: 0,
      longestSurvivingEvil: { name: 'Cy', survived: false, night: 3 },
    };
    render(<GameSummaryCard gs={gs} />);
    expect(screen.getByText('Cy — fell N3')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('no evils at all shows a plain dash', () => {
    const gs = { nominations: 0, voteAccuracy: 1, ghostVotesUsed: 0, ghostVotesEligible: 0, longestSurvivingEvil: null };
    render(<GameSummaryCard gs={gs} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
