import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameHistoryOverlay from './GameHistoryOverlay.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

const page1 = {
  games: [
    { id: 'g1', endedAt: Date.UTC(2026, 8, 20, 10, 0), edition: 'tb', playerCount: 7, winner: 'good' },
    { id: 'g2', endedAt: Date.UTC(2026, 8, 19, 10, 0), edition: 'bmr', playerCount: 8, winner: 'evil' },
  ],
  nextBefore: 111,
};
const page2 = {
  games: [{ id: 'g3', endedAt: Date.UTC(2026, 8, 18, 10, 0), edition: 'sv', playerCount: 5, winner: null }],
  nextBefore: null,
};

const gameDetail = {
  winner: 'good',
  edition: 'tb',
  playerCount: 3,
  endedAt: Date.UTC(2026, 8, 20, 10, 0),
  reason: 'The Demon fell.',
  players: [
    { name: 'Ada', seatName: 'Ada', alive: true, team: 'townsfolk', characterName: 'Chef', won: true },
    { name: 'Bo', seatName: 'Bo', alive: false, team: 'demon', characterName: 'Imp', won: false },
  ],
  nominations: [
    { day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: true, yesCount: 3, virginFired: false },
  ],
  log: [
    { night: 1, text: 'Night 1 begins.' },
  ],
};

function baseMocks(overrides = {}) {
  return mockFetch({
    '/api/leaderboard/voting': [],
    '/api/leaderboard/characters': [],
    '/api/games?': page1,
    ...overrides,
  });
}

describe('GameHistoryOverlay', () => {
  it('lists past games with date/script/players/winner', async () => {
    baseMocks();
    render(<GameHistoryOverlay onClose={() => {}} />);
    expect(await screen.findByText('Trouble Brewing')).toBeInTheDocument();
    expect(screen.getByText('Bad Moon Rising')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText('Evil')).toBeInTheDocument();
  });

  it('Load more appends the next page instead of replacing the list', async () => {
    // A single conditional route, not two overlapping string keys — the
    // page-2 URL contains the page-1 key as a literal substring
    // (limit=20&before=111 includes limit=20), so two static keys would
    // let the first-registered one shadow the second in mockFetch's
    // substring matching.
    const fetchMock = mockFetch({
      '/api/leaderboard/voting': [], '/api/leaderboard/characters': [],
      '/api/games?': url => (url.includes('before=111') ? page2 : page1),
    });
    render(<GameHistoryOverlay onClose={() => {}} />);
    await screen.findByText('Trouble Brewing');
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Sects & Violets')).toBeInTheDocument();
    expect(screen.getByText('Trouble Brewing')).toBeInTheDocument(); // page 1 still there
    expect(fetchMock.calls.some(c => c.url.includes('before=111'))).toBe(true);
    // page2's nextBefore is null — Load more should be gone now
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('"Show bot-test games" is off by default, and toggling it refetches with the bot-inclusive flag', async () => {
    const botsPage = { games: [{ id: 'gbot', endedAt: Date.UTC(2026, 8, 21, 10, 0), edition: 'custom', playerCount: 5, winner: 'evil' }], nextBefore: null };
    mockFetch({
      '/api/leaderboard/voting': [], '/api/leaderboard/characters': [],
      '/api/games?': url => (url.includes('includeBots=1') ? botsPage : page1),
    });
    render(<GameHistoryOverlay onClose={() => {}} />);
    await screen.findByText('Trouble Brewing');
    const toggle = screen.getByRole('checkbox', { name: /show bot-test games/i });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByText('Custom script')).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(await screen.findByText('Custom script')).toBeInTheDocument();
  });

  it('shows an empty state when there are no games at all', async () => {
    mockFetch({ '/api/leaderboard/voting': [], '/api/leaderboard/characters': [], '/api/games?': { games: [], nextBefore: null } });
    render(<GameHistoryOverlay onClose={() => {}} />);
    expect(await screen.findByText(/No games recorded yet/)).toBeInTheDocument();
  });

  it('reports a load failure without crashing', async () => {
    globalThis.fetch = () => Promise.reject(new Error('network down'));
    render(<GameHistoryOverlay onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('Could not load game history.')).toBeInTheDocument());
  });

  it('clicking a game opens its detail: victory summary, roster, timeline, and a shareable recap link', async () => {
    baseMocks({ '/api/game?id=g1': gameDetail });
    render(<GameHistoryOverlay onClose={() => {}} />);
    await userEvent.click(await screen.findByText('Trouble Brewing'));

    expect(await screen.findByText('Good wins')).toBeInTheDocument();
    expect(screen.getByText('The Demon fell.')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Won')).toBeInTheDocument();
    expect(screen.getByText('Lost')).toBeInTheDocument();
    expect(screen.getByText('Chef')).toBeInTheDocument();
    expect(screen.getByText('Night 1 begins.')).toBeInTheDocument();
    expect(screen.getByText('Ada → Bo')).toBeInTheDocument();

    const recapLink = screen.getByRole('link', { name: 'Shareable recap →' });
    expect(recapLink).toHaveAttribute('href', '/recap?id=g1');
    expect(recapLink).toHaveAttribute('target', '_blank');
  });

  it('a dead roster seat renders struck through (the shared .deadname class)', async () => {
    baseMocks({ '/api/game?id=g1': gameDetail });
    render(<GameHistoryOverlay onClose={() => {}} />);
    await userEvent.click(await screen.findByText('Trouble Brewing'));
    expect(await screen.findByText('Bo')).toHaveClass('deadname');
  });

  it('the Back button returns to the list', async () => {
    baseMocks({ '/api/game?id=g1': gameDetail });
    render(<GameHistoryOverlay onClose={() => {}} />);
    await userEvent.click(await screen.findByText('Trouble Brewing'));
    await screen.findByText('Good wins');
    await userEvent.click(screen.getByRole('button', { name: /all games/i }));
    expect(await screen.findByText('Past games')).toBeInTheDocument();
  });

  it('shows the server\'s own error message when a game is missing', async () => {
    baseMocks({ '/api/game?id=g1': { error: 'No such game.' } });
    render(<GameHistoryOverlay onClose={() => {}} />);
    await userEvent.click(await screen.findByText('Trouble Brewing'));
    expect(await screen.findByText('No such game.')).toBeInTheDocument();
  });

  it('calls onClose when Close is clicked', async () => {
    baseMocks();
    let closed = false;
    render(<GameHistoryOverlay onClose={() => { closed = true; }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toBe(true);
  });
});
