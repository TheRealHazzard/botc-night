// Index 0 is the unused "no difficulty set" slot; 1-4 are real. One shared
// array — this used to be inlined separately for the selector's list rows
// and the view panel's boxed difficulty readout, which is how a
// difficulty-4 script once ended up with dots but no name: only one of the
// two copies had ever been extended past "Hard".
export const DIFFICULTY_LABELS = ['', 'Easy', 'Medium', 'Hard', 'Very Hard'];

// The dot count itself had the exact same two-copies-drift bug as the
// labels above (both ScriptDifficultyRow and ScriptDifficultyPanel drew
// their own literal [1,2,3]) — one shared source now, sized to match
// DIFFICULTY_LABELS' own real range.
export const DIFFICULTY_LEVELS = [1, 2, 3, 4];

// The real script logo image is preferred when one's been dropped in
// (/scripts/<id>.png); this is the hand-drawn fallback icon, keyed by
// script id, used when that image 404s.
export const SCRIPT_ICON = { tb: 'mug', bmr: 'cloud', sv: 'eye' };

export const TEAM_ORDER = ['townsfolk', 'outsider', 'minion', 'demon'];
export const TEAM_LABELS = {
  townsfolk: 'Townsfolk',
  outsider: 'Outsiders',
  minion: 'Minions',
  demon: 'Demons',
};

// Townsfolk/Outsider/Minion/Demon, in that order, each only present if the
// list actually has one — shared by the in-game roster sidepanel and
// (later, if needed) the script picker's own cast reference.
export function groupByTeam(characters) {
  const byTeam = {};
  characters.forEach(c => {
    (byTeam[c.team] = byTeam[c.team] || []).push(c);
  });
  return TEAM_ORDER.filter(team => byTeam[team] && byTeam[team].length).map(team => ({ team, list: byTeam[team] }));
}
