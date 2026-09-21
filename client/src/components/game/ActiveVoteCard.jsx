import { useEffect, useReducer } from 'react';
import GhostIcon from '../GhostIcon.jsx';

/** Renders whenever useActiveVote has a live vote (voting/locked stages —
    'revealed' is handled by the full-screen VoteRevealOverlay instead, so
    this component just stops rendering once revealVote() flips the stage). */
export default function ActiveVoteCard({ activeVote, castVote, revealVote, ghostVoteEnabled, setGhostVoteEnabled }) {
  // The clock below is read straight off Date.now() at render time, so it
  // only actually moves when something re-renders this component. Before
  // useActiveVote's own window-close check fires, its interval keeps
  // returning the same activeVote object while time remains (a deliberate
  // no-op re-render skip) — so without an own tick here, the number only
  // ever happened to update when some unrelated SSE push re-rendered the
  // tree, which reads as "it counts down until I vote, then freezes" once
  // a player's own vote stops being the reason for those pushes. Same
  // fix as the host Countdown component: an unconditional 1s force-tick
  // scoped to exactly the window this is shown and counting.
  const [, tick] = useReducer(n => n + 1, 0);
  useEffect(() => {
    if (activeVote.stage !== 'voting') return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeVote.stage]);

  if (activeVote.stage === 'locked') {
    return (
      <div className="card">
        <h2>Vote locked in.</h2>
        <div className="votelocked">
          <p className="dim">Say why you voted the way you did on {activeVote.nomineeName}, then reveal it.</p>
          <button type="button" className="primary" onClick={revealVote}>Reveal my vote</button>
        </div>
      </div>
    );
  }

  const left = Math.max(0, Math.ceil((activeVote.windowEndsAt - Date.now()) / 1000));
  const locked = activeVote.isGhostVote && !ghostVoteEnabled;

  return (
    <div className="card">
      <div className={'clock' + (left <= 5 ? ' urgent' : '')}>{left}</div>
      <h2>Vote: {activeVote.nomineeName}</h2>

      {activeVote.isGhostVote && (
        <button
          type="button"
          className={'ghosttoggle' + (ghostVoteEnabled ? ' on' : '')}
          aria-pressed={ghostVoteEnabled}
          onClick={() => setGhostVoteEnabled(v => !v)}
        >
          <GhostIcon />
          <span>{ghostVoteEnabled ? 'Ghost vote armed — this is your only one, ever.' : 'Use my one ghost vote to vote here'}</span>
        </button>
      )}

      <div className="votebtns">
        <button type="button" className={'votebtn yes' + (activeVote.myChoice === 'yes' ? ' on' : '')} disabled={locked} onClick={() => castVote('yes')}>Yes</button>
        <button type="button" className={'votebtn no' + (activeVote.myChoice === 'no' ? ' on' : '')} disabled={locked} onClick={() => castVote('no')}>No</button>
      </div>
    </div>
  );
}
