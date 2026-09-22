import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OverView from './OverView.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

function stubReducedMotion(matches) {
  vi.stubGlobal('matchMedia', () => ({ matches, addEventListener: () => {}, removeEventListener: () => {} }));
}

const players = [
  { id: 'p1', name: 'Ada', alive: true, connected: true, character: 'Empath', color: { hex: '#8e2226' } },
  { id: 'p2', name: 'Bo', alive: false, connected: true, character: 'Imp', color: null },
];
const gameSummary = { nominations: 3, voteAccuracy: 0.8, ghostVotesUsed: 1, ghostVotesEligible: 1, longestSurvivingEvil: { name: 'Bo', survived: false, night: 2 } };
const log = [{ night: 1, phase: 'night', text: 'Ada learned two neighbors.' }];

function baseMocks(overrides = {}) {
  return mockFetch({
    '/api/tokens': {},
    '/api/session/current': { gamesPlayed: 1, goodWins: 1, evilWins: 0, players: [] },
    '/api/profile': { found: false },
    ...overrides,
  });
}

describe('OverView', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('the victory banner starts hidden and reveals itself after a beat, not immediately', () => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    baseMocks();
    const { container } = render(<OverView players={players} victory={{ winner: 'good', reason: 'The Demon fell.' }} gameSummary={gameSummary} log={log} actionLog={[]} nightNumber={2} />);
    const banner = () => screen.getByText('Good wins').closest('.victory-banner');
    expect(banner()).not.toHaveClass('show');
    expect(container.querySelector('.ring')).not.toHaveClass('glow-good');

    act(() => { vi.advanceTimersByTime(550); });
    expect(banner()).toHaveClass('show');
    expect(container.querySelector('.ring')).toHaveClass('glow-good');
  });

  it('reveals the banner and the ring glow immediately, no delay, under reduced motion', () => {
    stubReducedMotion(true);
    baseMocks();
    const { container } = render(<OverView players={players} victory={{ winner: 'evil', reason: 'The town executed a Townsfolk.' }} gameSummary={gameSummary} log={log} actionLog={[]} nightNumber={2} />);
    expect(screen.getByText('Evil wins').closest('.victory-banner')).toHaveClass('show');
    expect(container.querySelector('.ring')).toHaveClass('glow-evil');
  });

  it('a good win shows the sun-badged banner and reason', () => {
    baseMocks();
    render(<OverView players={players} victory={{ winner: 'good', reason: 'The Demon fell.' }} gameSummary={gameSummary} log={log} actionLog={[]} nightNumber={2} />);
    expect(screen.getByText('Good wins')).toBeInTheDocument();
    expect(screen.getByText('The Demon fell.')).toBeInTheDocument();
  });

  it('an evil win shows the skull-badged banner', () => {
    baseMocks();
    render(<OverView players={players} victory={{ winner: 'evil', reason: 'The town executed a Townsfolk.' }} gameSummary={gameSummary} log={log} actionLog={[]} nightNumber={2} />);
    expect(screen.getByText('Evil wins')).toBeInTheDocument();
  });

  it('shows the game log and game summary', () => {
    baseMocks();
    render(<OverView players={players} victory={{ winner: 'good', reason: 'x' }} gameSummary={gameSummary} log={log} actionLog={[]} nightNumber={2} />);
    expect(screen.getByText('What actually happened')).toBeInTheDocument();
    expect(screen.getByText('Night 1: Ada learned two neighbors.')).toBeInTheDocument();
    expect(screen.getByText('This game')).toBeInTheDocument();
  });

  it('labels a day-phase log line "Day N", not "Night N" — executions never happen at night', () => {
    baseMocks();
    const dayLog = [{ night: 1, phase: 'day', text: 'Bo was executed.' }];
    render(<OverView players={players} victory={null} gameSummary={null} log={dayLog} actionLog={[]} nightNumber={1} />);
    expect(screen.getByText('Day 1: Bo was executed.')).toBeInTheDocument();
  });

  it('a lobby-phase log line (or older data with no recorded phase) has no misleading Night/Day prefix', () => {
    baseMocks();
    const lobbyLog = [{ night: 0, phase: 'lobby', text: 'Ada took a seat.' }, { night: 1, text: 'Undated older entry.' }];
    render(<OverView players={players} victory={null} gameSummary={null} log={lobbyLog} actionLog={[]} nightNumber={0} />);
    expect(screen.getByText('Ada took a seat.')).toBeInTheDocument();
    expect(screen.getByText('Undated older entry.')).toBeInTheDocument();
  });

  it('the Power log button only appears with a non-empty actionLog, and opens the overlay', async () => {
    baseMocks();
    const { rerender } = render(<OverView players={players} victory={null} gameSummary={null} log={[]} actionLog={[]} nightNumber={1} />);
    expect(screen.queryByText('Power log')).not.toBeInTheDocument();

    rerender(<OverView players={players} victory={null} gameSummary={null} log={[]} actionLog={[{ night: 1, phase: 'night', playerId: 'p1', targets: ['Bo'] }]} nightNumber={1} />);
    await userEvent.click(screen.getByText('Power log'));
    expect(screen.getByText('Power log', { selector: 'h2' })).toBeInTheDocument();
  });

  it('the Power log button also appears with a non-empty resultsLog, even when actionLog is empty (a game of pure info roles)', () => {
    baseMocks();
    const resultsLog = [{ night: 1, playerId: 'p1', playerName: 'Ada', characterId: 'empath', characterName: 'Empath', title: 'Empath', body: 'Evil living neighbours: 0' }];
    render(<OverView players={players} victory={null} gameSummary={null} log={[]} actionLog={[]} resultsLog={resultsLog} nightNumber={1} />);
    expect(screen.getByText('Power log')).toBeInTheDocument();
  });

  it('shows revealed character names in the roster', () => {
    baseMocks();
    render(<OverView players={players} victory={null} gameSummary={null} log={[]} actionLog={[]} nightNumber={1} />);
    expect(screen.getByText('Full roster')).toBeInTheDocument();
    expect(screen.getByText('Empath')).toBeInTheDocument();
    expect(screen.getByText('Imp')).toBeInTheDocument();
  });

  it("shows a player's career line once their profile stats resolve", async () => {
    baseMocks({ '/api/profile': { found: true, stats: { gamesPlayed: 5, winRate: 0.6 } } });
    render(<OverView players={players} victory={null} gameSummary={null} log={[]} actionLog={[]} nightNumber={1} />);
    expect(await screen.findAllByText(/5 games · 60% win rate/)).toHaveLength(2);
  });
});
