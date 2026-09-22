import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { post } from '../../lib/api.js';
import { showToast } from '../../lib/toast.js';

// The operator half of what used to be one NominationPanel — placing a
// nomination on someone's behalf (a verbal nomination at the table, typed
// in here) is the Storyteller's own action, not something the table needs
// to watch happen; the result (NominationList.jsx) is what's dramatic.
// Renders nothing once a vote is already open (nothing left to pick) or
// with fewer than two living players.
export default function NominateAction({ nominations, nightNumber, players }) {
  const todays = nominations.filter(n => n.day === nightNumber);
  const openNom = todays.find(n => !n.closed);
  const living = players.filter(p => p.alive);

  // The vanilla rebuilt these <select>s from scratch on every SSE push
  // with no explicit .value, so the browser silently defaulted back to
  // "first alive player" on essentially any unrelated update — never a
  // deliberate design choice, just a side effect of full-rebuild-every-
  // render. Real component state here is a genuine improvement: the
  // in-progress selection survives an unrelated re-render and only resets
  // on a real remount (a new day), the same way every other prompt in
  // this port already behaves.
  const [nominatorId, setNominatorId] = useState(() => living[0]?.id || '');
  const [nomineeId, setNomineeId] = useState(() => living[0]?.id || '');
  const [submitting, setSubmitting] = useState(false);

  // A day commonly has more than one nomination, and several characters
  // (Virgin, Witch, Golem, a Slayer shot) can kill a player mid-day,
  // between them, without the host ever touching these dropdowns — left
  // alone, the still-selected dead player's name would keep showing while
  // silently no longer being a valid nominator/nominee, so a submit would
  // fail with a generic "only living players" alert and no obvious reason
  // why. Snap back to the first living player the moment that happens;
  // setState's identical-value bail-out keeps this a no-op otherwise.
  useEffect(() => {
    const aliveIds = new Set(players.filter(p => p.alive).map(p => p.id));
    const fallback = players.find(p => p.alive)?.id || '';
    setNominatorId(id => (id && aliveIds.has(id)) ? id : fallback);
    setNomineeId(id => (id && aliveIds.has(id)) ? id : fallback);
  }, [players]);

  if (openNom) return null;
  if (living.length < 2) return <p className="sub">Need at least two living players.</p>;

  const submit = () => {
    setSubmitting(true);
    post('/api/table/nominate', { nominatorId, nomineeId }).then(r => {
      setSubmitting(false);
      if (r.error) { showToast(r.error); return; }
      if (r.virginFired) {
        showToast('The Virgin was nominated by a Townsfolk — the nominator is executed immediately.', { kind: 'story' });
      }
    });
  };

  return (
    <div className="nomaction">
      <div className="nomrow">
        <select value={nominatorId} onChange={e => setNominatorId(e.target.value)}>
          {living.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <Icon name="arrows" size={16} />
        <select value={nomineeId} onChange={e => setNomineeId(e.target.value)}>
          {living.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <button type="button" disabled={submitting} onClick={submit}>
        <Icon name="check" size={15} /> Open for voting
      </button>
    </div>
  );
}
