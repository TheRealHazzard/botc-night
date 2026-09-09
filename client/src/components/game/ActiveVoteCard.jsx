import GhostIcon from '../GhostIcon.jsx';

/** Renders whenever useActiveVote has a live vote (voting/locked stages —
    'revealed' is handled by the full-screen VoteRevealOverlay instead, so
    this component just stops rendering once revealVote() flips the stage). */
export default function ActiveVoteCard({ activeVote, castVote, revealVote, ghostVoteEnabled, setGhostVoteEnabled }) {
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
        <div className={'ghosttoggle' + (ghostVoteEnabled ? ' on' : '')} onClick={() => setGhostVoteEnabled(v => !v)}>
          <GhostIcon />
          <span>{ghostVoteEnabled ? 'Ghost vote armed — this is your only one, ever.' : 'Use my one ghost vote to vote here'}</span>
        </div>
      )}

      <div className="votebtns">
        <button type="button" className={'votebtn yes' + (activeVote.myChoice === 'yes' ? ' on' : '')} disabled={locked} onClick={() => castVote('yes')}>Yes</button>
        <button type="button" className={'votebtn no' + (activeVote.myChoice === 'no' ? ' on' : '')} disabled={locked} onClick={() => castVote('no')}>No</button>
      </div>
    </div>
  );
}
