import { useEffect } from 'react';

// The full-screen yes/no/none flash — shown for the 5 seconds
// useActiveVote's revealVote() holds `stage: 'revealed'` before clearing
// activeVote entirely.
export default function VoteRevealOverlay({ activeVote }) {
  const showing = !!activeVote && activeVote.stage === 'revealed';

  useEffect(() => {
    if (!showing) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [showing]);

  if (!showing) return null;

  const choice = activeVote.myChoice;
  const cls = choice === 'yes' ? 'yes' : choice === 'no' ? 'no' : 'none';
  const word = choice === 'yes' ? 'YES' : choice === 'no' ? 'NO' : 'NO VOTE';

  return (
    <div className={'reveal-overlay ' + cls}>
      <div className="revealword">{word}</div>
      <div className="revealsub">on {activeVote.nomineeName}</div>
    </div>
  );
}
