import { useEffect } from 'react';
import { useScript } from '../hooks/useScript.js';

const EDITION_NAMES = { tb: 'Trouble Brewing', bmr: 'Bad Moon Rising', sv: 'Sects & Violets', custom: 'Custom script' };
const TEAM_ORDER = ['townsfolk', 'outsider', 'minion', 'demon'];
const TEAM_LABEL = { townsfolk: 'Townsfolk', outsider: 'Outsiders', minion: 'Minions', demon: 'Demons' };

export default function ScriptOverlay({ open, onClose }) {
  const data = useScript(open);

  // iOS can still let a scroll gesture reach the page behind a fixed
  // overlay — locking the body while it's open is the standard guard, on
  // top of overscroll-behavior on the list itself (see the CSS).
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const groups = data
    ? TEAM_ORDER.map(team => ({ team, list: data.characters.filter(c => c.team === team) }))
      .filter(g => g.list.length)
    : [];

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="overlay-card">
        <div className="overlay-head">
          <h2>{data ? (EDITION_NAMES[data.edition] || data.edition) : 'The script'}</h2>
          <button type="button" className="linklike" onClick={onClose}>Close</button>
        </div>
        <div className="overlay-scroll">
          {!data && <p className="dim small">Loading…</p>}
          {groups.map(({ team, list }) => (
            <div className="scriptgroup" key={team}>
              <div className="scriptgroup-title">{TEAM_LABEL[team]} ({list.length})</div>
              {list.map(c => (
                <div className="scriptchar" key={c.id}>
                  <div className="row">
                    <span className="cname">{c.name}</span>
                    <span className={'team ' + (team === 'townsfolk' || team === 'outsider' ? 'good' : 'evil')}>
                      {team}
                    </span>
                  </div>
                  <div className="ability">{c.ability}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
