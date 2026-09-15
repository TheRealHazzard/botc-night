import { useState } from 'react';
import Icon from '../Icon.jsx';
import SidepanelCard from '../SidepanelCard.jsx';

const STORAGE_KEY = 'botc-toolkit-scoreboard';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(rows) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); } catch { /* private-browsing or full storage — scores just won't survive a reload */ }
}

/** A running tally across a whole game night, not tied to any one game —
    persisted to localStorage (same JSON-blob-under-one-key approach as the
    rest of the toolkit) so a reload mid-night doesn't wipe the score. */
export default function ScoreboardTool() {
  const [rows, setRows] = useState(load);
  const [name, setName] = useState('');

  const commit = next => { setRows(next); save(next); };

  const addRow = e => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
    commit([...rows, { id, name: trimmed, score: 0 }]);
    setName('');
  };

  const adjust = (id, delta) => {
    commit(rows.map(r => (r.id === id ? { ...r, score: r.score + delta } : r)));
  };

  const remove = id => commit(rows.filter(r => r.id !== id));

  const resetAll = () => {
    if (rows.length && !confirm('Reset every score to zero?')) return;
    commit(rows.map(r => ({ ...r, score: 0 })));
  };

  return (
    <SidepanelCard icon="trophy" title="Scoreboard">
      {rows.length > 0 && (
        <div className="toolkit-scorerows">
          {rows
            .slice()
            .sort((a, b) => b.score - a.score)
            .map(row => (
              <div className="toolkit-scorerow" key={row.id}>
                <span className="toolkit-scorename">{row.name}</span>
                <span className="toolkit-scoreval mono">{row.score}</span>
                <button type="button" className="ghostbtn" aria-label={`Subtract a point from ${row.name}`} onClick={() => adjust(row.id, -1)}>−</button>
                <button type="button" className="ghostbtn" aria-label={`Add a point to ${row.name}`} onClick={() => adjust(row.id, 1)}>+</button>
                <button type="button" className="ghostbtn" aria-label={`Remove ${row.name}`} onClick={() => remove(row.id)}>
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
        </div>
      )}
      <form className="toolkit-scoreadd" onSubmit={addRow}>
        <input type="text" placeholder="Add a name…" value={name} onChange={e => setName(e.target.value)} />
        <button type="submit" className="ghost" disabled={!name.trim()}>
          <Icon name="users" size={14} /> Add
        </button>
      </form>
      {rows.length > 0 && (
        <button type="button" className="ghostbtn" onClick={resetAll}>
          <Icon name="refresh" size={14} /> Reset all scores
        </button>
      )}
    </SidepanelCard>
  );
}
