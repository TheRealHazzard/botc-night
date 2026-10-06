/** Ranks played profiles the same way everywhere this app shows an
    all-time leaderboard — most wins first, then win rate, then games
    played, as a plain tiebreak chain. Filters out anyone with zero
    games recorded; an unplayed profile has nothing to rank. Shared by
    HallOfFameOverlay's full table and LeaderboardTeaserCard's short
    preview of it, so the two can never quietly disagree on order. */
export function rankProfiles(profiles) {
  return (profiles || [])
    .filter(p => p.gamesPlayed > 0)
    .slice()
    .sort((a, b) => b.wins - a.wins || (b.winRate || 0) - (a.winRate || 0) || b.gamesPlayed - a.gamesPlayed);
}
