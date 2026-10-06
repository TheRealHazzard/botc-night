import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LeaderboardTeaserCard from './LeaderboardTeaserCard.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

function baseMocks(profiles) {
  return mockFetch({
    '/api/profiles': profiles,
    '/api/leaderboard/voting': [],
    '/api/leaderboard/characters': [],
    '/api/leaderboard/theory': [],
  });
}

const profiles = [
  { id: 'ada', name: 'Ada', gamesPlayed: 5, wins: 4, winRate: 0.8, currentWinStreak: 3, longestWinStreak: 3 },
  { id: 'bo', name: 'Bo', gamesPlayed: 3, wins: 1, winRate: 1 / 3, currentWinStreak: 0, longestWinStreak: 2 },
  { id: 'cy', name: 'Cy', gamesPlayed: 4, wins: 0, winRate: 0, currentWinStreak: 0, longestWinStreak: 0 },
];

describe('LeaderboardTeaserCard', () => {
  it('shows the top 3 all-time profiles by wins', async () => {
    baseMocks(profiles);
    const { container } = render(<LeaderboardTeaserCard />);
    expect(await screen.findByText('All-time leaderboard')).toBeInTheDocument();
    // toHaveTextContent, not getByText — the rank numeral is its own
    // <span> (so its color can differ from the name), which getByText
    // can't see across since it only joins a node's own direct text-
    // node children, not nested elements.
    const rows = container.querySelectorAll('.ledger-rank-row');
    expect(rows[0]).toHaveTextContent('#1 Ada');
    expect(rows[0]).toHaveTextContent('4W — 80%');
    expect(rows[1]).toHaveTextContent('#2 Bo');
    expect(rows[2]).toHaveTextContent('#3 Cy');
    expect(rows[0]).toHaveClass('lead');
    expect(rows[1]).not.toHaveClass('lead');
  });

  it('opens the full Hall of Fame overlay from its own button', async () => {
    baseMocks(profiles);
    render(<LeaderboardTeaserCard />);
    await screen.findByText('All-time leaderboard');
    await userEvent.click(screen.getByText(/full leaderboard/i));
    expect(await screen.findByText('Hall of Fame')).toBeInTheDocument();
  });

  it('renders nothing with fewer than two ranked profiles', async () => {
    baseMocks([profiles[0]]);
    const { container } = render(<LeaderboardTeaserCard />);
    await new Promise(r => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on a load failure', async () => {
    globalThis.fetch = () => Promise.reject(new Error('network down'));
    const { container } = render(<LeaderboardTeaserCard />);
    await new Promise(r => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
