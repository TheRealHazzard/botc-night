import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import Countdown from './Countdown.jsx';
import VoteBar from './VoteBar.jsx';
import { post } from '../../lib/api.js';
import { useEnteringSeatIds } from '../hooks/useEnteringSeatIds.js';

export default function NominationPanel({ nominations, nightNumber, players, voteWindowSeconds }) {
  const todays = nominations.filter(n => n.day === nightNumber);
  const openNom = todays.find(n => !n.closed);
  const living = players.filter(p => p.alive);

  // Same "new since last commit" tracking LobbyView uses for a seat that
  // just joined — a nomination that just appeared gets one brief slide+
  // flash, everything already on screen when this table first mounted
  // does not. The hook is generic over whatever ids it's handed; there's
  // nothing seat-specific in it despite the name.
  const nomKey = n => n.nominationId || `${n.nominatorName}-${n.nomineeName}-${n.day}`;
  const enteringKeys = useEnteringSeatIds(todays.map(nomKey));

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

  const submit = () => {
    setSubmitting(true);
    post('/api/table/nominate', { nominatorId, nomineeId }).then(r => {
      setSubmitting(false);
      if (r.error) { alert(r.error); return; }
      if (r.virginFired) {
        alert('The Virgin was nominated by a Townsfolk — the nominator is executed immediately.');
      }
    });
  };

  return (
    <div className="nompanel">
      <div className="dayreport-title">
        <Icon name="hand" size={14} />
        <span>Nominations</span>
      </div>

      {todays.length > 0 && (
        <div className="nomlist">
          {todays.map(n => {
            const yesCount = n.closed ? n.yesCount : n.votes.filter(v => v.vote === 'yes').length;
            const status = n.closed ? `${yesCount} yes` : 'voting…';
            const key = nomKey(n);
            return (
              <div className={'nomline' + (enteringKeys.has(key) ? ' entering' : '')} key={key}>
                {n.virginFired && <Icon name="bolt" size={13} />}
                <span>
                  {n.nominatorName} → {n.nomineeName} — {status}
                  {n.virginFired ? '  —  Virgin fired, nominator executed' : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {openNom ? (
        <OpenVote nomination={openNom} players={players} voteWindowSeconds={voteWindowSeconds} />
      ) : living.length < 2 ? (
        <p className="sub">Need at least two living players.</p>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

function OpenVote({ nomination, players, voteWindowSeconds }) {
  // The real rule an execution needs: a majority of the LIVING (not of
  // whoever still has an unused ghost vote to cast) — same threshold
  // engine.js's own close-of-vote majority check uses.
  const eligible = players.filter(p => p.alive || !p.ghostVoteUsed).length;
  const yes = nomination.votes.filter(v => v.vote === 'yes').length;
  const no = nomination.votes.length - yes;
  const threshold = Math.max(1, Math.ceil(players.filter(p => p.alive).length / 2));

  return (
    <>
      <Countdown windowEndsAt={nomination.windowEndsAt} total={voteWindowSeconds} />
      <VoteBar yes={yes} threshold={threshold} />
      <div className="sub">{no} no · {eligible - nomination.votes.length} not yet voted</div>
    </>
  );
}
