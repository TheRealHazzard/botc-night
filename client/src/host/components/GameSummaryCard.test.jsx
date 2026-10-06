import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameSummaryCard from './GameSummaryCard.jsx';

describe('GameSummaryCard', () => {
  it('shows the game-wide stats, with a survived evil correctly worded', () => {
    const gs = {
      nominations: 4, voteAccuracy: 0.75, ghostVotesUsed: 1, ghostVotesEligible: 2,
      longestSurvivingEvil: { name: 'Bo', survived: true },
      firstToDie: { name: 'Ash', night: 1, phase: 'night' },
      mostNominated: { name: 'Cy', count: 3 },
    };
    render(<GameSummaryCard gs={gs} />);
    expect(screen.getByText('This game')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('Bo — made it')).toBeInTheDocument();
    expect(screen.getByText('Ash — Night 1')).toBeInTheDocument();
    expect(screen.getByText('Cy (3)')).toBeInTheDocument();
  });

  it('a fallen evil names the night they fell; a day execution is worded as a day', () => {
    const gs = {
      nominations: 0, voteAccuracy: null, ghostVotesUsed: 0, ghostVotesEligible: 0,
      longestSurvivingEvil: { name: 'Cy', survived: false, night: 3 },
      firstToDie: { name: 'Ash', night: 2, phase: 'day' },
      mostNominated: null,
    };
    render(<GameSummaryCard gs={gs} />);
    expect(screen.getByText('Cy — fell N3')).toBeInTheDocument();
    expect(screen.getByText('Ash — Day 2')).toBeInTheDocument();
  });

  it('no evils, no deaths, and no nominations all show a plain dash', () => {
    const gs = {
      nominations: 0, voteAccuracy: 1, ghostVotesUsed: 0, ghostVotesEligible: 0,
      longestSurvivingEvil: null, firstToDie: null, mostNominated: null,
    };
    render(<GameSummaryCard gs={gs} />);
    expect(screen.getAllByText('—')).toHaveLength(3);
  });
});
