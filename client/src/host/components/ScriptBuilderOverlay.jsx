import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { post } from '../../lib/api.js';

const TEAM_ORDER = ['townsfolk', 'outsider', 'minion', 'demon'];
const TEAM_LABEL = { townsfolk: 'Townsfolk', outsider: 'Outsiders', minion: 'Minions', demon: 'Demons' };

/** Room to actually get experimental (Night IV) — assemble any of the ~98
    dealable characters into a one-off roster instead of only choosing a
    fixed meta.editions script. /api/setup-table gives the live balance
    readout something real to compare against (the same official T/O/M/D
    counts dealRoles() itself uses, just fetched once here since there's no
    real game yet to read setupRatio off of). Committing posts
    {customRoster: [ids]} to the same /api/table/script route a named
    edition uses — validated server-side (game/helpers.js's
    activeScriptPool, server.js's own checks), not just here. */
export default function ScriptBuilderOverlay({ playerCount, onClose, onCommitted }) {
  const [characters, setCharacters] = useState(null);
  const [setupTable, setSetupTable] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/characters').then(r => r.json()).then(setCharacters).catch(() => setCharacters([]));
    fetch('/api/setup-table').then(r => r.json()).then(setSetupTable).catch(() => setSetupTable({}));
  }, []);

  const grouped = useMemo(() => {
    const g = {};
    for (const team of TEAM_ORDER) g[team] = (characters || []).filter(c => c.team === team);
    return g;
  }, [characters]);

  const toggle = id => setSelected(s => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const wanted = playerCount && setupTable ? setupTable[String(playerCount)] : null;
  const haveCount = team => (grouped[team] || []).filter(c => selected.has(c.id)).length;

  const commit = () => {
    setSaving(true);
    setError('');
    post('/api/table/script', { customRoster: [...selected] }).then(r => {
      setSaving(false);
      if (r.error) { setError(r.error); return; }
      onCommitted();
    });
  };

  return (
    <div className="settings-overlay script-builder-overlay">
      <div className="settings-header">
        <h2>Build a script</h2>
        <button type="button" className="ghostbtn" onClick={onClose}><Icon name="close" size={15} /> Close</button>
      </div>
      <div className="settings-body script-builder-body">
        {!characters ? (
          <div className="sub">Loading characters…</div>
        ) : (
          <>
            <div className="script-builder-list">
              {TEAM_ORDER.map(team => (
                <div className="settings-section" key={team}>
                  <h3>
                    {TEAM_LABEL[team]}
                    {' — '}
                    {wanted ? `${haveCount(team)} / ${wanted[team]}` : `${haveCount(team)} selected`}
                  </h3>
                  <div className="script-builder-grid">
                    {grouped[team].map(c => (
                      <label key={c.id} className={'script-builder-chip' + (selected.has(c.id) ? ' on' : '')}>
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="script-builder-footer">
              <div className="sub">
                {selected.size} character{selected.size === 1 ? '' : 's'} selected
                {playerCount ? ` for ${playerCount} seated player${playerCount === 1 ? '' : 's'}` : ''}.
              </div>
              {error && <div className="script-builder-error">{error}</div>}
              <button type="button" className="primary" disabled={saving || selected.size < 5} onClick={commit}>
                <Icon name="check" size={15} /> Use this roster
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
