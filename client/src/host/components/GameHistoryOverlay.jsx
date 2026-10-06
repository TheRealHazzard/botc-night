import { useEffect, useState } from 'react';
import LeaderboardPanel from './LeaderboardPanel.jsx';
import LbPanel from './LbPanel.jsx';

const EDITION_NAMES = { tb: 'Trouble Brewing', bmr: 'Bad Moon Rising', sv: 'Sects & Violets', custom: 'Custom script' };

// Matches the kind strings resolveWhim()'s callers pass as ctx.kind (see
// WHIM_SYSTEM in server.js) — human labels for the same four judgment
// calls, read back here from the persisted record. The only place any of
// this reasoning is ever shown — see WhimCallsPanel below, post-game only,
// a table never sees it live (the TV screen's own WhimConfirmCard, which
// did show it live, was retired for exactly that reason).
const WHIM_KIND_LABELS = {
  'mayor-redirect': 'Mayor redirect',
  'registration-ambiguity': 'Misregistration',
  'pacifist-save': 'Pacifist save',
  'sage-recluse-demon': 'Sage/Recluse ambiguity',
};
function whimLabel(kind) { return WHIM_KIND_LABELS[kind] || kind; }

function fmtPct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }
function isGoodTeam(team) { return team === 'townsfolk' || team === 'outsider'; }
function fmtDate(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// In-app port of public/games.html — see CharactersOverlay.jsx's own
// header comment for why. The static page itself stays as-is, still
// reachable directly and from stats.html. The old ?id= URL param that
// switched games.html between its list and detail views becomes a plain
// selectedGameId here instead — same list/detail split, no URL involved.
export default function GameHistoryOverlay({ onClose }) {
  const [selectedGameId, setSelectedGameId] = useState(null);

  return (
    <div className="settings-overlay">
      <div className="settings-header">
        <h2>{selectedGameId ? 'Game detail' : 'Game history'}</h2>
        <button type="button" className="ghostbtn" onClick={onClose}>Close</button>
      </div>
      <div className="powerlog-body">
        {selectedGameId
          ? <GameDetail id={selectedGameId} onBack={() => setSelectedGameId(null)} />
          : <GameList onSelect={setSelectedGameId} />}
      </div>
    </div>
  );
}

function GameList({ onSelect }) {
  const [games, setGames] = useState([]);
  const [nextBefore, setNextBefore] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [voting, setVoting] = useState([]);
  const [charWinRates, setCharWinRates] = useState([]);
  // Off by default — a game a bot filled a seat in
  // (/api/table/add-bots) is real, but not what browsing "what have we
  // actually played" wants cluttering the list. Still one tap away for
  // testing. See game/history.js's own listGames() comment.
  const [includeBots, setIncludeBots] = useState(false);

  function loadPage(before, withBots) {
    const qs = '?limit=20' + (before ? '&before=' + before : '') + (withBots ? '&includeBots=1' : '');
    fetch('/api/games' + qs)
      .then(r => r.json())
      .then(data => {
        setGames(g => (before ? [...g, ...data.games] : data.games));
        setNextBefore(data.nextBefore);
        setLoaded(true);
      })
      .catch(() => setFailed(true));
  }

  useEffect(() => {
    fetch('/api/leaderboard/voting').then(r => r.json()).then(setVoting).catch(() => {});
    fetch('/api/leaderboard/characters').then(r => r.json()).then(setCharWinRates).catch(() => {});
    loadPage(undefined, false);
    // Mount-once, matching games.html's own single initial loadPage() call
    // — loadPage's "before" cursor param is threaded explicitly by the
    // Load More button, not by a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The underlying page set changes with the filter, so this starts a
  // fresh first page rather than trying to patch the existing list/cursor.
  function toggleIncludeBots() {
    const next = !includeBots;
    setIncludeBots(next);
    setLoaded(false);
    setFailed(false);
    loadPage(undefined, next);
  }

  return (
    <>
      {/* games.html only ever showed the top 5 of each leaderboard here
          (hall-of-fame.html's own copy shows every row instead) — same
          shared component, different slice at each call site. */}
      <LeaderboardPanel
        title="Best good voters"
        subtitle="Correct alignment calls — voting yes on evil, no on good (needs at least 5 votes on record)."
        rows={voting.slice(0, 5)}
        renderValue={row => `${fmtPct(row.accuracy)} (${row.correctVotes}/${row.totalVotes})`}
        emptyText="Nobody has cast enough votes yet — this fills in as real games get played."
      />
      <LeaderboardPanel
        title="Character win rates"
        subtitle="How each character has fared across every recorded game."
        rows={charWinRates.slice(0, 5)}
        renderValue={row => `${fmtPct(row.winRate)} (${row.wins}/${row.total})`}
        emptyText="No completed games yet."
      />

      <LbPanel
        title="Past games"
        action={
          <label className="gh-bot-toggle">
            <input type="checkbox" checked={includeBots} onChange={toggleIncludeBots} />
            Show bot-test games
          </label>
        }
      >
        {!loaded && !failed && <p className="sub">Loading…</p>}
        {failed && <p className="sub">Could not load game history.</p>}
        {loaded && !failed && games.length === 0 && (
          <p className="sub">No games recorded yet — they show up here as soon as one finishes.</p>
        )}
        {loaded && !failed && games.length > 0 && (
          <>
            <div className="table-scroll">
              <table className="powerlog-table">
                <thead>
                  <tr><th>Date</th><th>Script</th><th>Players</th><th>Winner</th></tr>
                </thead>
                <tbody>
                  {games.map(g => (
                    <tr key={g.id} className="gh-clickable" onClick={() => onSelect(g.id)}>
                      <td>{fmtDate(g.endedAt)}</td>
                      <td>{EDITION_NAMES[g.edition] || g.edition}</td>
                      <td className="mono">{g.playerCount}</td>
                      <td className={g.winner === 'good' ? 'gh-win' : g.winner === 'evil' ? 'gh-loss' : ''}>
                        {g.winner ? (g.winner === 'good' ? 'Good' : 'Evil') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nextBefore && (
              <button type="button" className="gh-loadmore" onClick={() => loadPage(nextBefore, includeBots)}>Load more</button>
            )}
          </>
        )}
      </LbPanel>
    </>
  );
}

function GameDetail({ id, onBack }) {
  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/game?id=' + encodeURIComponent(id))
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setGame(data);
      })
      .catch(() => { if (!cancelled) setError('Could not load this game.'); });
    return () => { cancelled = true; };
  }, [id]);

  // Merges nominations (keyed by their own `day`) and log entries (keyed
  // by `night`) into one timeline, exactly as games.html's own renderDetail
  // does — this app already uses the day/night number interchangeably
  // across the two, so a day's nominations and that same night's log
  // entries land in the same block.
  const byDay = {};
  if (game) {
    (game.nominations || []).forEach(n => { (byDay[n.day] = byDay[n.day] || []).push(n); });
    (game.log || []).forEach(l => { byDay[l.night] = byDay[l.night] || []; });
  }
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);

  return (
    <>
      <button type="button" className="ghostbtn gh-back" onClick={onBack}>← All games</button>
      {!game && !error && <p className="sub">Loading…</p>}
      {error && <p className="sub">{error}</p>}
      {game && (
        <>
          <LbPanel>
            <div className="gh-victory">
              <span className="gh-who">
                {game.winner === 'good' ? 'Good wins' : game.winner === 'evil' ? 'Evil wins' : 'Unresolved'}
              </span>
              <span className="sub">
                {EDITION_NAMES[game.edition] || game.edition} · {game.playerCount} players · {fmtDate(game.endedAt)}
              </span>
            </div>
            {game.reason && <p>{game.reason}</p>}
            {/* Deliberately still an external, new-tab link — recap.html is
                a gate-exempt page meant to be shared outside the table,
                not part of the host's own fullscreen session. */}
            <p className="sub">
              Paste-ready for a group chat:{' '}
              <a href={`/recap?id=${encodeURIComponent(id)}`} target="_blank" rel="noopener noreferrer">Shareable recap →</a>
            </p>
          </LbPanel>

          <LbPanel title="Roster">
            <div className="table-scroll">
              <table className="powerlog-table">
                <thead><tr><th>Name</th><th>Role</th><th>Outcome</th></tr></thead>
                <tbody>
                  {game.players.map((p, i) => {
                    const good = isGoodTeam(p.team);
                    const outcomeText = p.won == null ? '—' : p.won ? 'Won' : 'Lost';
                    return (
                      <tr key={i}>
                        <td><span className={p.alive ? undefined : 'deadname'}>{p.name || p.seatName}</span></td>
                        <td className={good ? 'gh-role-good' : 'gh-role-evil'}>
                          <span className={'gh-align-dot ' + (good ? 'good' : 'evil')} />
                          {p.characterName || p.characterId || 'unknown'}
                        </td>
                        <td className={p.won ? 'gh-win' : p.won === false ? 'gh-loss' : ''}>{outcomeText}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </LbPanel>

          <LbPanel title="Timeline">
            {!days.length && <p className="sub">No recorded nominations or log entries for this game.</p>}
            <div className="gh-timeline">
              {days.map(day => (
                <div className="gh-dayblock" key={day}>
                  <h3>Night {day}</h3>
                  {byDay[day].map((n, i) => (
                    <div className="gh-nomline" key={i}>
                      <span>{n.nominatorName} → {n.nomineeName}{n.virginFired ? ' (Virgin fired)' : ''}</span>
                      <span className="gh-tally">{n.closed ? `${n.yesCount} yes` : 'unresolved'}</span>
                    </div>
                  ))}
                  {(game.log || []).filter(l => l.night === day).map((l, i) => (
                    <div className="gh-logline" key={i}>{l.text}</div>
                  ))}
                </div>
              ))}
            </div>
          </LbPanel>

          <WhimCallsPanel decisionLog={game.decisionLog} />
        </>
      )}
    </>
  );
}

// The post-game answer to "why should I trust the AI's calls" — every
// Bucket-1 judgment resolveWhim() ever made this game (game/helpers.js),
// fired or not, with whatever one-sentence reasoning the judge gave.
// Deliberately only ever shown here, after the game is over and this
// record is already final: showing it live would let a player read the
// Storyteller's own hand instead of just playing the table in front of
// them. Renders nothing for an older game recorded before decisionLog
// existed, or one that never actually hit a whim-eligible moment.
function WhimCallsPanel({ decisionLog }) {
  const calls = (decisionLog || [])
    .filter(e => typeof e.tag === 'string' && e.tag.startsWith('whim:'))
    .map(e => ({
      night: e.night,
      kind: e.tag.slice('whim:'.length),
      fired: !!(e.value && e.value.fired),
      reason: (e.value && e.value.reason) || null,
    }));
  if (!calls.length) return null;

  return (
    <LbPanel title="Storyteller's calls">
      <p className="sub">
        Every borderline judgment call made this game, and why — shown now that the game is
        over, so it can't be used to read the table while it's still being played.
      </p>
      <div className="table-scroll">
        <table className="powerlog-table">
          <thead><tr><th>Night</th><th>Call</th><th>Outcome</th><th>Reasoning</th></tr></thead>
          <tbody>
            {calls.map((c, i) => (
              <tr key={i}>
                <td>{c.night}</td>
                <td>{whimLabel(c.kind)}</td>
                <td>{c.fired ? 'Fired' : 'Did not fire'}</td>
                <td>{c.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </LbPanel>
  );
}
