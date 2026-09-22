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
  // /api/table/nominate 409s on either of these — a repeat nominee ("has
  // already been nominated today") or a nominator who's already used
  // their one nomination for the day ("has already nominated someone
  // today") — so both dropdowns drop the ineligible names rather than
  // offering a pick that can only fail.
  const nominatedTodayIds = new Set(todays.map(n => n.nomineeId));
  const alreadyNominatorIds = new Set(todays.map(n => n.nominatorId));
  const eligibleNominees = living.filter(p => !nominatedTodayIds.has(p.id));
  const eligibleNominators = living.filter(p => !alreadyNominatorIds.has(p.id));

  // The vanilla rebuilt these <select>s from scratch on every SSE push
  // with no explicit .value, so the browser silently defaulted back to
  // "first alive player" on essentially any unrelated update — never a
  // deliberate design choice, just a side effect of full-rebuild-every-
  // render. Real component state here is a genuine improvement: the
  // in-progress selection survives an unrelated re-render and only resets
  // on a real remount (a new day), the same way every other prompt in
  // this port already behaves.
  const [nominatorId, setNominatorId] = useState(() => eligibleNominators[0]?.id || '');
  const [nomineeId, setNomineeId] = useState(() => eligibleNominees[0]?.id || '');
  const [submitting, setSubmitting] = useState(false);

  // A day commonly has more than one nomination, and several characters
  // (Virgin, Witch, Golem, a Slayer shot) can kill a player mid-day,
  // between them, without the host ever touching these dropdowns — left
  // alone, the still-selected dead (or now-ineligible) player's name would
  // keep showing while silently no longer a valid nominator/nominee, so a
  // submit would fail with a generic 409 and no obvious reason why. Snap
  // back to the first eligible player the moment that happens; setState's
  // identical-value bail-out keeps this a no-op otherwise.
  useEffect(() => {
    const nominatorIds = new Set(eligibleNominators.map(p => p.id));
    const nomineeIds = new Set(eligibleNominees.map(p => p.id));
    setNominatorId(id => (id && nominatorIds.has(id)) ? id : (eligibleNominators[0]?.id || ''));
    setNomineeId(id => (id && nomineeIds.has(id)) ? id : (eligibleNominees[0]?.id || ''));
  }, [eligibleNominators, eligibleNominees]);

  if (openNom) return null;
  if (living.length < 2) return <p className="sub">Need at least two living players.</p>;
  if (!eligibleNominators.length) return <p className="sub">Everyone living has already nominated someone today.</p>;
  if (!eligibleNominees.length) return <p className="sub">Everyone living has already been nominated today.</p>;

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
          {eligibleNominators.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <Icon name="arrows" size={16} />
        <select value={nomineeId} onChange={e => setNomineeId(e.target.value)}>
          {eligibleNominees.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <button type="button" disabled={submitting} onClick={submit}>
        <Icon name="check" size={15} /> Open for voting
      </button>
    </div>
  );
}
