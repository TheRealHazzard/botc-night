import { describe, it, expect } from 'vitest';
import { rankProfiles } from './leaderboard.js';

describe('rankProfiles', () => {
  it('ranks by wins, then win rate, then games played, excluding anyone with zero games', () => {
    const profiles = [
      { id: 'ada', name: 'Ada', gamesPlayed: 5, wins: 4, winRate: 0.8 },
      { id: 'bo', name: 'Bo', gamesPlayed: 3, wins: 1, winRate: 1 / 3 },
      { id: 'cy', name: 'Cy', gamesPlayed: 0, wins: 0, winRate: null },
    ];
    expect(rankProfiles(profiles).map(p => p.id)).toEqual(['ada', 'bo']);
  });

  it('breaks a wins tie on win rate', () => {
    const profiles = [
      { id: 'low', name: 'Low', gamesPlayed: 10, wins: 2, winRate: 0.2 },
      { id: 'high', name: 'High', gamesPlayed: 4, wins: 2, winRate: 0.5 },
    ];
    expect(rankProfiles(profiles).map(p => p.id)).toEqual(['high', 'low']);
  });

  it('handles an empty or missing list', () => {
    expect(rankProfiles([])).toEqual([]);
    expect(rankProfiles(null)).toEqual([]);
  });
});
