import { motion, useReducedMotion } from 'framer-motion';
import Icon from './Icon.jsx';
import Countdown from './Countdown.jsx';
import VoteBar from './VoteBar.jsx';
import { useEnteringSeatIds } from '../hooks/useEnteringSeatIds.js';

// A spring instead of the old nomline-enter keyframe's fixed 0.5s
// ease-out — same reasoning as RingSeat's own seat-enter conversion: a
// nomination that just landed reads livelier with real overshoot than a
// fixed-duration ease. Only ever plays on mount (never a replay later),
// since NominationList keys each row by a stable id/name combo the same
// way RingSeats keys each seat by the player's own id.
const NOM_ENTER_TRANSITION = { type: 'spring', stiffness: 300, damping: 24 };

// The presentational half of what used to be one NominationPanel — the
// table's own eyes on today's nominations and the live vote tally. Who
// nominates whom (NominateAction.jsx) is the Storyteller's own action,
// tucked into the sidepanel's own "Storyteller controls" card instead;
// this half is exactly what's dramatic to watch and stays on the main
// screen.
export default function NominationList({ nominations, nightNumber, players, voteWindowSeconds }) {
  const todays = nominations.filter(n => n.day === nightNumber);
  const openNom = todays.find(n => !n.closed);

  const nomKey = n => n.nominationId || `${n.nominatorName}-${n.nomineeName}-${n.day}`;
  const enteringKeys = useEnteringSeatIds(todays.map(nomKey));
  const reduceMotion = useReducedMotion();

  return (
    <div className="nompanel">
      <div className="dayreport-title">
        <Icon name="hand" size={14} />
        <span>Nominations</span>
      </div>

      {todays.length > 0 && (
        <div className="nomlist">
          {/* threshold is n.threshold — the majority as it stood the moment
              THIS nomination actually closed (see closeNomination() in
              server.js), not today's current living count. A same-day
              death after close (Virgin, Witch, Golem, a Slayer shot)
              shrinks the living count but can't retroactively change
              whether an already-decided nomination passed. The live
              recompute only kicks in as a fallback for a nomination closed
              before this field existed. */}
          {todays.map(n => {
            const yesCount = n.closed ? n.yesCount : n.votes.filter(v => v.vote === 'yes').length;
            const threshold = typeof n.threshold === 'number' ? n.threshold : Math.max(1, Math.ceil(players.filter(p => p.alive).length / 2));
            const met = n.closed && yesCount >= threshold;
            const status = n.closed ? `${yesCount} / ${threshold} yes` : 'voting…';
            const key = nomKey(n);
            const entering = enteringKeys.has(key);
            return (
              <motion.div
                className={'nomline' + (entering ? ' entering' : '')}
                key={key}
                initial={entering && !reduceMotion ? { opacity: 0, x: -8, backgroundColor: 'rgba(184, 134, 63, 0.28)' } : false}
                animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(184, 134, 63, 0)' }}
                transition={NOM_ENTER_TRANSITION}
              >
                {n.virginFired && <Icon name="bolt" size={13} />}
                <span>
                  {n.nominatorName} → {n.nomineeName} —{' '}
                  {n.closed ? <span className={'tally' + (met ? ' met' : '')}>{status}</span> : status}
                  {n.virginFired ? '  —  Virgin fired, nominator executed' : ''}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}

      {openNom && <OpenVote nomination={openNom} players={players} voteWindowSeconds={voteWindowSeconds} />}
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
      {/* nomination.windowTotalSeconds — the seconds THIS vote actually
          opened for, snapshotted server-side at nominateHandler (see
          server.js) — not a live re-read of voteWindowSeconds, which a
          host adjusting Timing settings mid-vote would otherwise desync
          the ring's fullness from the real time left. The prop stays as a
          fallback for a nomination that predates this field. */}
      <Countdown windowEndsAt={nomination.windowEndsAt} total={nomination.windowTotalSeconds ?? voteWindowSeconds} />
      <VoteBar yes={yes} threshold={threshold} />
      <div className="sub">{no} no · {eligible - nomination.votes.length} not yet voted</div>
    </>
  );
}
