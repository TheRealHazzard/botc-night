import { Fragment } from 'react';
import Icon from './Icon.jsx';
import TokenOrFallback from './TokenOrFallback.jsx';

/** Every real "choose a player" moment of the whole game, one row per
    character, one column per night/day — a full-screen lightbox rather
    than a sidepanel card, since a long game with a full table makes for a
    genuinely wide/tall grid that needs its own scrollable space instead of
    competing with the fixed-height dashboard for room. Both the acting
    role and every target get their actual token art, not just a name —
    text alone was hard to scan at a glance. */
export default function PowerLogOverlay({ players, actionLog, resultsLog, nightNumber, onClose }) {
  const nights = Array.from({ length: nightNumber }, (_, i) => i + 1);

  // Grouped by night only, not split into Night/Day columns like the grid
  // above — a result carries no phase of its own (game.results is a flat
  // per-player slot a day action can overwrite just as a night one does),
  // so night-by-night is the coarsest grouping that's still always honest.
  const infoByNight = {};
  (resultsLog || []).forEach(r => {
    (infoByNight[r.night] = infoByNight[r.night] || []).push(r);
  });
  const infoNights = Object.keys(infoByNight).map(Number).sort((a, b) => a - b);
  // actionLog's targets are recorded by name, not id (see game/engine.js) —
  // /api/join now rejects a duplicate name at the source, but this stays
  // defensive against older data from before that existed: a name shared
  // by two seats can't be resolved to either one's token art, so it maps
  // to null (a safe "unknown" fallback) rather than silently picking
  // whichever player happened to be seen last.
  const nameCounts = {};
  players.forEach(p => { nameCounts[p.name] = (nameCounts[p.name] || 0) + 1; });
  const playersByName = {};
  players.forEach(p => { playersByName[p.name] = nameCounts[p.name] === 1 ? p : null; });

  return (
    <div className="powerlog-overlay">
      <div className="powerlog-header">
        <h2>Power log</h2>
        <button type="button" className="ghostbtn" onClick={onClose}><Icon name="close" size={15} /> Close</button>
      </div>
      <div className="powerlog-body">
        <table className="powerlog-table">
          <tbody>
            <tr>
              <th>Role</th>
              {nights.map(n => (
                <Fragment key={n}>
                  <th>Night {n}</th>
                  <th>Day {n}</th>
                </Fragment>
              ))}
            </tr>
            {players.map(p => (
              <tr key={p.id}>
                <td>
                  <div className="powerlog-role-cell">
                    <TokenOrFallback characterId={p.characterId} imgClass="powerlog-token" fallbackClass="powerlog-token-fallback" />
                    <div>
                      <span className="powerlog-role">{p.character || 'Unknown'}</span>
                      <span className="powerlog-name">{p.name}</span>
                    </div>
                  </div>
                </td>
                {nights.map(n => (
                  <Fragment key={n}>
                    <PowerLogCell player={p} night={n} phase="night" actionLog={actionLog} playersByName={playersByName} />
                    <PowerLogCell player={p} night={n} phase="day" actionLog={actionLog} playersByName={playersByName} />
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {infoNights.length > 0 && (
          <div className="powerlog-info">
            <h3>Information received</h3>
            {infoNights.map(n => (
              <div className="powerlog-info-night" key={n}>
                <div className="powerlog-info-night-label">Night {n}</div>
                {infoByNight[n].map((r, i) => (
                  <div className="powerlog-info-row" key={i}>
                    <TokenOrFallback characterId={r.characterId} imgClass="powerlog-token" fallbackClass="powerlog-token-fallback" />
                    <div>
                      <span className="powerlog-info-who">{r.playerName} &mdash; {r.characterName || 'Unknown'}</span>
                      <span className="powerlog-info-body">{r.title ? `${r.title}: ` : ''}{r.body}</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PowerLogCell({ player, night, phase, actionLog, playersByName }) {
  const entries = actionLog.filter(a => a.playerId === player.id && a.night === night && a.phase === phase);
  if (!entries.length) return <td className="empty">—</td>;
  return (
    <td className="used">
      {entries.map((e, ei) => (
        <span key={ei}>
          {ei > 0 && '; '}
          {e.targets.map((name, ti) => {
            const targetPlayer = playersByName[name];
            return (
              <span key={ti}>
                {ti > 0 && ' & '}
                <span className="powerlog-target">
                  <TokenOrFallback characterId={targetPlayer && targetPlayer.characterId} imgClass="powerlog-target-token" fallbackClass="powerlog-target-token-fallback" />
                  {name}
                </span>
              </span>
            );
          })}
        </span>
      ))}
    </td>
  );
}
