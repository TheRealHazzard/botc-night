import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HallOfFameOverlay from './HallOfFameOverlay.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

const profiles = [
  { id: 'ada', name: 'Ada', color: { hex: '#8e2226' }, gamesPlayed: 5, wins: 4, winRate: 0.8, currentWinStreak: 3, longestWinStreak: 3 },
  { id: 'bo', name: 'Bo', color: null, gamesPlayed: 3, wins: 1, winRate: 1 / 3, currentWinStreak: 0, longestWinStreak: 2 },
  { id: 'cy', name: 'Cy', color: null, gamesPlayed: 0, wins: 0, winRate: null, currentWinStreak: 0, longestWinStreak: 0 },
];

function baseMocks(overrides = {}) {
  return mockFetch({
    '/api/profiles': profiles,
    '/api/leaderboard/voting': [],
    '/api/leaderboard/characters': [],
    '/api/leaderboard/theory': [],
    ...overrides,
  });
}

describe('HallOfFameOverlay', () => {
  it('ranks played profiles by wins, excludes anyone with zero games', async () => {
    baseMocks();
    render(<HallOfFameOverlay onClose={() => {}} />);
    expect(await screen.findByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.queryByText('Cy')).not.toBeInTheDocument(); // 0 games played

    const rows = screen.getAllByRole('row').slice(1); // drop the header row
    expect(rows[0]).toHaveTextContent('Ada');
    expect(rows[1]).toHaveTextContent('Bo');
  });

  it('shows a live streak differently from a best-ever one', async () => {
    baseMocks();
    render(<HallOfFameOverlay onClose={() => {}} />);
    await screen.findByText('Ada');
    expect(screen.getByText('3 in a row')).toBeInTheDocument(); // Ada, currentWinStreak 3
    expect(screen.getByText('best: 2')).toBeInTheDocument(); // Bo, currentWinStreak 0 but longest 2
  });

  it('shows all three leaderboards once they load', async () => {
    baseMocks({
      '/api/leaderboard/voting': [{ profileId: 'ada', name: 'Ada', accuracy: 0.8, correctVotes: 4, totalVotes: 5 }],
      '/api/leaderboard/characters': [{ characterId: 'imp', name: 'Imp', wins: 2, total: 3, winRate: 2 / 3 }],
      '/api/leaderboard/theory': [{ profileId: 'ada', name: 'Ada', accuracy: 0.6, correctGuesses: 3, totalGuesses: 5 }],
    });
    render(<HallOfFameOverlay onClose={() => {}} />);
    expect(await screen.findByText('80% (4/5)')).toBeInTheDocument();
    expect(screen.getByText('67% (2/3)')).toBeInTheDocument();
    expect(screen.getByText('60% (3/5)')).toBeInTheDocument();
    expect(screen.getByText('Best theorists')).toBeInTheDocument();
  });

  it('says so plainly when nobody has finished a game yet', async () => {
    baseMocks({ '/api/profiles': [] });
    render(<HallOfFameOverlay onClose={() => {}} />);
    expect(await screen.findByText(/Nobody's finished a game yet/)).toBeInTheDocument();
  });

  it('reports a load failure without crashing', async () => {
    globalThis.fetch = () => Promise.reject(new Error('network down'));
    render(<HallOfFameOverlay onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Could not load the Hall of Fame right now.')).toBeInTheDocument());
  });

  it('calls onClose when Close is clicked', async () => {
    baseMocks();
    let closed = false;
    render(<HallOfFameOverlay onClose={() => { closed = true; }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toBe(true);
  });
});
