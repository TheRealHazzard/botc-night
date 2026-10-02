import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import TokenOrFallback from './TokenOrFallback.jsx';
import { post } from '../../lib/api.js';

function fmtWhen(ms) {
  if (!ms) return 'a committed snapshot, never live-fetched yet';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Every official jinx (see game/jinxData.js) that actually applies to the
// table's current script — both characters have to be in the roster, or
// it's real but moot here (a jinx naming a character this build has never
// implemented, e.g. Chambermaid). `implemented` is a hand-maintained code
// fact (jinxData.js's own IMPLEMENTED_PAIRS), not something this fetch can
// ever determine on its own — shown honestly rather than implying every
// listed ruling is already handled correctly. Token portraits are safe to
// show here regardless of game phase: a jinx is a fact about the SCRIPT's
// own character list, never about which seat holds which role, the same
// reason FeaturedRoleCard/ScriptBrowseRoster already show token art with
// no reveal gate of their own.
export default function JinxesOverlay({ onClose }) {
  const [data, setData] = useState(null); // null = loading
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = () => fetch('/api/jinxes').then(r => r.json()).then(setData).catch(() => setFailed(true));

  useEffect(() => { load(); }, []);

  const refresh = () => {
    setRefreshing(true);
    post('/api/jinxes/refresh', {}).then(r => {
      setRefreshing(false);
      if (!r.error) setData(r);
    }).catch(() => setRefreshing(false));
  };

  return (
    <div className="settings-overlay">
      <div className="settings-header">
        <h2>Jinxes</h2>
        <button type="button" className="ghostbtn" onClick={onClose}><Icon name="close" size={15} /> Close</button>
      </div>
      <div className="powerlog-body">
        {data === null && !failed && <p className="sub">Loading…</p>}
        {failed && <p className="sub">Could not load jinx data right now.</p>}
        {data && (
          <>
            <div className="checklist-progress">
              <div className="checklist-progress-row">
                <h3>Official rulings for this script's roster</h3>
                <button type="button" className="ghostbtn" disabled={refreshing} onClick={refresh}>
                  <Icon name="refresh" size={14} /> {refreshing ? 'Checking…' : 'Refresh from official data'}
                </button>
              </div>
              <p className="sub">
                Last refreshed: {fmtWhen(data.fetchedAt)}. Source: {data.source === 'live' ? 'official API' : 'committed seed snapshot'}.
              </p>
            </div>

            {data.pairs.length === 0 && (
              <p className="sub">No official jinx applies to this script's current roster.</p>
            )}

            {data.pairs.map(p => (
              <div className={'jinx-row' + (p.implemented ? '' : ' jinx-open')} key={p.a.id + '+' + p.b.id}>
                <div className="jinx-pair">
                  <div className="jinx-token-slot">
                    <TokenOrFallback characterId={p.a.id} imgClass="powerlog-token" fallbackClass="powerlog-token-fallback" />
                    <span className="jinx-token-name">{p.a.name}</span>
                  </div>
                  <Icon name="bolt" size={16} className="jinx-bolt" />
                  <div className="jinx-token-slot">
                    <TokenOrFallback characterId={p.b.id} imgClass="powerlog-token" fallbackClass="powerlog-token-fallback" />
                    <span className="jinx-token-name">{p.b.name}</span>
                  </div>
                  <span className={'jinx-badge' + (p.implemented ? ' jinx-badge-ok' : ' jinx-badge-open')}>
                    {p.implemented ? 'Handled' : 'Not yet implemented'}
                  </span>
                </div>
                <p className="sub jinx-reason">{p.reason}</p>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
