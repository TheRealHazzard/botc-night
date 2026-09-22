import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';

const TEAM_LABEL = { townsfolk: 'Townsfolk', outsider: 'Outsiders', minion: 'Minions', demon: 'Demons' };
const TEAM_ORDER = ['townsfolk', 'outsider', 'minion', 'demon'];

function fmtPct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }

// In-app port of public/characters.html, so the header's own "Character
// checklist" button stops opening a new tab (which the Fullscreen API can
// never follow into — see App.jsx). characters.html itself stays as-is:
// it's still reachable directly and from stats.html's own nav, a phone-
// side page with no fullscreen concern of its own.
export default function CharactersOverlay({ onClose }) {
  const [chars, setChars] = useState(null); // null = still loading
  const [untestedOnly, setUntestedOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/characters/checklist')
      .then(r => r.json())
      .then(data => { if (!cancelled) setChars(data); })
      .catch(() => { if (!cancelled) setChars([]); });
    return () => { cancelled = true; };
  }, []);

  const tested = chars ? chars.filter(c => c.timesPlayed > 0).length : 0;

  return (
    <div className="settings-overlay">
      <div className="settings-header">
        <h2>Character checklist</h2>
        <button type="button" className="ghostbtn" onClick={onClose}>Close</button>
      </div>
      <div className="powerlog-body">
        {chars === null && <p className="sub">Loading…</p>}
        {chars && chars.length === 0 && <p className="sub">Could not load the character list right now.</p>}
        {chars && chars.length > 0 && (
          <>
            <div className="checklist-progress">
              <div className="checklist-progress-row">
                <h3>Tested live at this table</h3>
                <span className="checklist-progress-count">{tested} / {chars.length}</span>
              </div>
              <div className="checklist-progress-track">
                <div className="checklist-progress-fill" style={{ width: `${chars.length ? (100 * tested / chars.length) : 0}%` }} />
              </div>
              <p className="sub">A character counts once at least one real (non-simulation) game has dealt it to a real player.</p>
            </div>

            <div className="checklist-filters">
              <button type="button" className={untestedOnly ? '' : 'on'} onClick={() => setUntestedOnly(false)}>All characters</button>
              <button type="button" className={untestedOnly ? 'on' : ''} onClick={() => setUntestedOnly(true)}>Untested only</button>
            </div>

            {TEAM_ORDER.map(team => {
              let inTeam = chars.filter(c => c.team === team);
              if (untestedOnly) inTeam = inTeam.filter(c => !c.timesPlayed);
              if (!inTeam.length) return null;
              // Same as characters.html's own teamGroup(): the count shown
              // is within whatever's currently displayed, not the team's
              // full roster — so "Untested only" correctly reads N/N, not
              // a confusing 0/(full team size).
              const teamTested = inTeam.filter(c => c.timesPlayed > 0).length;
              return (
                <div className="checklist-team-group" key={team}>
                  <h3>{TEAM_LABEL[team] || team} <span className="checklist-team-n">{teamTested}/{inTeam.length}</span></h3>
                  {inTeam.map(c => (
                    <div className={'checklist-row' + (c.timesPlayed ? '' : ' untested')} key={c.id}>
                      <div className="checklist-charname">
                        <span className={'checklist-mark' + (c.timesPlayed ? ' tested' : ' untested')}>
                          {c.timesPlayed > 0 && <Icon name="check" size={11} />}
                        </span>
                        {c.name}
                      </div>
                      <div className="checklist-stat">
                        {c.timesPlayed ? `${c.timesPlayed} game${c.timesPlayed === 1 ? '' : 's'} · ${fmtPct(c.winRate)} win` : 'never dealt'}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
            {untestedOnly && chars.every(c => c.timesPlayed) && (
              <p className="sub">Every character has been dealt in a real game at least once.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
