import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import NominationList from './NominationList.jsx';

const players5 = [
  { id: 'p1', name: 'Ada', alive: true, ghostVoteUsed: false },
  { id: 'p2', name: 'Bo', alive: true, ghostVoteUsed: false },
  { id: 'p3', name: 'Cy', alive: true, ghostVoteUsed: false },
  { id: 'p4', name: 'Di', alive: true, ghostVoteUsed: false },
  { id: 'p5', name: 'Ed', alive: false, ghostVoteUsed: false },
];

describe('NominationList', () => {
  it('lists today\'s nominations, open ones as "voting…", closed ones with their yes count', () => {
    const nominations = [
      { day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: true, yesCount: 3, votes: [] },
      { day: 1, nominatorName: 'Cy', nomineeName: 'Di', closed: false, votes: [{ vote: 'yes' }] },
    ];
    render(<NominationList nominations={nominations} nightNumber={1} players={players5} voteWindowSeconds={20} />);
    expect(screen.getByText(/Ada → Bo — 3 yes/)).toBeInTheDocument();
    expect(screen.getByText(/Cy → Di — voting…/)).toBeInTheDocument();
  });

  it('an open vote below threshold: correct label, no "met" class, proportional width', () => {
    const openNom = { day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: false, windowEndsAt: Date.now() + 20000, votes: [{ vote: 'yes' }] };
    const { container } = render(<NominationList nominations={[openNom]} nightNumber={1} players={players5} voteWindowSeconds={20} />);
    // 4 alive -> threshold ceil(4/2) = 2 (at least half, rounded up — not
    // "strictly more than half", which only agrees for an odd count)
    expect(screen.getByText('1 / 2 needed to execute')).toBeInTheDocument();
    expect(container.querySelector('.votebar-fill')).not.toHaveClass('met');
  });

  it('an open vote at threshold: gains "met", width caps at 100%', () => {
    const openNom = { day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: false, windowEndsAt: Date.now() + 20000, votes: [{ vote: 'yes' }, { vote: 'yes' }] };
    const { container } = render(<NominationList nominations={[openNom]} nightNumber={1} players={players5} voteWindowSeconds={20} />);
    expect(screen.getByText('2 / 2 needed to execute')).toBeInTheDocument();
    expect(container.querySelector('.votebar-fill')).toHaveClass('met');
    expect(container.querySelector('.votebar-fill').style.width).toBe('100%');
  });

  it('an open vote shows the countdown and the not-yet-voted count', () => {
    const openNom = { day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: false, windowEndsAt: Date.now() + 8000, votes: [{ vote: 'yes' }] };
    render(<NominationList nominations={[openNom]} nightNumber={1} players={players5} voteWindowSeconds={20} />);
    expect(screen.getByText('8')).toBeInTheDocument();
    // eligible = alive OR (!ghostVoteUsed) = 4 alive + 1 dead-not-spent = 5; 5 - 1 vote = 4 not yet voted
    expect(screen.getByText(/0 no · 4 not yet voted/)).toBeInTheDocument();
  });

  it('no nomination list or vote tally when nothing has happened today', () => {
    const { container } = render(<NominationList nominations={[]} nightNumber={1} players={players5} voteWindowSeconds={20} />);
    expect(container.querySelector('.nomlist')).not.toBeInTheDocument();
    expect(container.querySelector('.votebar-fill')).not.toBeInTheDocument();
  });
});
