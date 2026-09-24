import { describePlayOfTheGame, describeMvp } from '../lib/describeReveal.js';
import Icon from './Icon.jsx';

function nameFor(players, id) {
  const p = (players || []).find(x => x.id === id);
  return p ? p.name : 'Someone';
}
function characterFor(players, id) {
  const p = (players || []).find(x => x.id === id);
  return p ? p.character : null;
}
function namesFor(players, event) {
  return { playerName: nameFor(players, event.playerId), targetName: event.targetId ? nameFor(players, event.targetId) : undefined };
}

/** Purely presentational — same "renders from a plain data object, fetches
    nothing itself" shape as GameSummaryCard.jsx/RevealCardOverlay.jsx's
    own RevealCard. Reuses describePlayOfTheGame/describeMvp from
    describeReveal.js for the two highlight lines, so this game's own
    exact wording for "why this mattered" lives in exactly one place,
    same as the reveal cards themselves. `players` must be the LIVE
    game's roster (real ids matching pivotalHighlights' own playerId/
    targetId fields) — the persisted history record has no id field to
    resolve those against, only seat names, which is why this card is
    only ever built from the just-finished game still in memory, not a
    re-fetched history record. */
export default function SessionShareCard({ session, pivotalHighlights, players }) {
  const potg = pivotalHighlights && pivotalHighlights.playOfTheGame
    ? describePlayOfTheGame(pivotalHighlights.playOfTheGame, namesFor(players, pivotalHighlights.playOfTheGame))
    : null;
  const mvp = pivotalHighlights && pivotalHighlights.mvp
    ? describeMvp(
      pivotalHighlights.mvp,
      { playerName: nameFor(players, pivotalHighlights.mvp.playerId), characterName: characterFor(players, pivotalHighlights.mvp.playerId) },
      pivotalHighlights.mvp.topEvent ? namesFor(players, pivotalHighlights.mvp.topEvent) : {},
    )
    : null;

  return (
    <div className="share-card">
      <div className="share-card-brand">
        <Icon name="brandmark" size={22} />
        <span>Blood on the Clocktower</span>
      </div>
      {/* Same tile layout as GameSummaryCard/SessionStatsCard — .dayreport's
          own house style, not a bespoke one just for this card. */}
      <div className="dayreport-rows">
        <div className="stat">
          <div className="stat-n mono">{session.gamesPlayed}</div>
          <div className="stat-lbl">{session.gamesPlayed === 1 ? 'Game' : 'Games'}</div>
        </div>
        <div className="stat">
          <div className="stat-n mono">{session.goodWins}</div>
          <div className="stat-lbl">Good wins</div>
        </div>
        <div className="stat">
          <div className="stat-n mono">{session.evilWins}</div>
          <div className="stat-lbl">Evil wins</div>
        </div>
      </div>
      {(potg || mvp) && (
        <div className="share-card-highlights">
          {potg && (
            <div className="share-card-highlight">
              <Icon name={potg.icon} size={20} />
              <div>
                <div className="share-card-highlight-title">{potg.title}</div>
                <div className="share-card-highlight-body">{potg.body}</div>
              </div>
            </div>
          )}
          {mvp && (
            <div className="share-card-highlight">
              <Icon name={mvp.icon} size={20} />
              <div>
                <div className="share-card-highlight-title">{mvp.title} — {mvp.subtitle}</div>
                <div className="share-card-highlight-body">{mvp.body}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
