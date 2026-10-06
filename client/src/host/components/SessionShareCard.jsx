import { describePlayOfTheGame, describeMvp, nameFor, characterFor, namesFor } from '../lib/describeReveal.js';
import Icon from './Icon.jsx';

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
    re-fetched history record.

    Keeps its own brand row (this is an exported, shareable PNG, viewed
    in its own overlay — not a live sidebar card, so it isn't built on
    SidepanelCard), but otherwise joined the Illuminated Ledger redesign:
    stats as ledger rows, highlights with PivotalMomentsCard's own drop-
    cap title (reusing its .pivotal-item* classes directly, not a
    separate copy) instead of an icon. */
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

  const stats = [
    [session.gamesPlayed === 1 ? 'Game' : 'Games', session.gamesPlayed],
    ['Good wins', session.goodWins],
    ['Evil wins', session.evilWins],
  ];

  return (
    <div className="share-card">
      {/* One wrapper, not three siblings — .share-card's own flex gap
          would otherwise stack on top of the rule divs' own margin-
          bottom (they're sized for a plain block parent, like
          .sidepanel-card, not one applying a uniform gap to every
          child), doubling the space around them. */}
      <div>
        <div className="share-card-brand">
          <Icon name="brandmark" size={22} />
          <span>Blood on the Clocktower</span>
        </div>
        <div className="sidepanel-rule-brass" />
        <div className="sidepanel-rule-soft" />
      </div>
      <div className="ledger">
        {stats.map(([lbl, val]) => (
          <div className="ledger-row" key={lbl}>
            <span className="ledger-label">{lbl}</span>
            <span className="ledger-leader" />
            <span className="ledger-value">{val}</span>
          </div>
        ))}
      </div>
      {(potg || mvp) && (
        <div className="share-card-highlights">
          {potg && (
            <div className="pivotal-item">
              <div className="pivotal-item-title">{potg.title}</div>
              <div className="pivotal-item-body">{potg.body}</div>
            </div>
          )}
          {mvp && (
            <div className="pivotal-item">
              <div className="pivotal-item-title">{mvp.title} — {mvp.subtitle}</div>
              <div className="pivotal-item-body">{mvp.body}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
