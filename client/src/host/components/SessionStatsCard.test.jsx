import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SessionStatsCard from './SessionStatsCard.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

describe('SessionStatsCard', () => {
  it('removes itself when this is the only game so far', async () => {
    mockFetch({ '/api/session/current': { gamesPlayed: 1, goodWins: 1, evilWins: 0, players: [] } });
    const { container } = render(<SessionStatsCard />);
    await new Promise(r => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('removes itself on a fetch failure', async () => {
    global.fetch = () => Promise.reject(new Error('offline'));
    const { container } = render(<SessionStatsCard />);
    await new Promise(r => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the tonight leaderboard once there are 2+ games', async () => {
    mockFetch({
      '/api/session/current': {
        gamesPlayed: 3, goodWins: 2, evilWins: 1,
        players: [{ name: 'Ada', wins: 2, gamesPlayed: 3 }, { name: 'Bo', wins: 1, gamesPlayed: 3 }],
      },
    });
    render(<SessionStatsCard />);
    expect(await screen.findByText('Tonight')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('2W / 3')).toBeInTheDocument();
  });

  it('caps the roster list at 6 players', async () => {
    const players = Array.from({ length: 9 }, (_, i) => ({ name: `P${i}`, wins: 0, gamesPlayed: 2 }));
    mockFetch({ '/api/session/current': { gamesPlayed: 2, goodWins: 1, evilWins: 1, players } });
    render(<SessionStatsCard />);
    await screen.findByText('Tonight');
    expect(screen.queryAllByText(/^P\d$/)).toHaveLength(6);
  });
});
