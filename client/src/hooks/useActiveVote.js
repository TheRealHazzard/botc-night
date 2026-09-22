import { useCallback, useEffect, useRef, useState } from 'react';
import { post } from '../lib/api.js';
import { showToast } from '../lib/toast.js';

/** The vote UI outlives the server's own voteRequest field — once the
    window closes (or a ghost's one vote is spent), the server correctly
    stops offering it, but the phone still needs the nominee's name and the
    player's own choice to run the "locked in, reveal when ready" beat. So
    this is tracked independently of P, keyed by nomination id, mirroring
    the vanilla version's module-level activeVote exactly — just as a hook
    instead of a global. */
export function useActiveVote(P, token) {
  const [activeVote, setActiveVote] = useState(null);
  const [ghostVoteEnabled, setGhostVoteEnabled] = useState(false);
  const revealTimerRef = useRef(null);

  const clearRevealTimer = () => clearTimeout(revealTimerRef.current);

  // Picks up a newly-opened nomination the moment the server offers one; a
  // phase change away from day before a reveal means the moment's passed —
  // don't leave a stale full-screen overlay lying around.
  useEffect(() => {
    if (!P) return;
    if (activeVote && P.phase !== 'day') {
      clearRevealTimer();
      setActiveVote(null);
      return;
    }
    const vr = P.voteRequest;
    if (vr && (!activeVote || activeVote.nominationId !== vr.nominationId)) {
      clearRevealTimer();
      setGhostVoteEnabled(false);
      setActiveVote({
        nominationId: vr.nominationId,
        nomineeName: vr.nomineeName,
        windowEndsAt: vr.windowEndsAt,
        isGhostVote: vr.isGhostVote,
        myChoice: null,
        stage: 'voting',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [P?.phase, P?.voteRequest?.nominationId]);

  // The voting -> locked transition is time-based, not a server push — its
  // own 1s tick, scoped to exactly the window this matters (while actually
  // voting), rather than piggybacking on unrelated re-renders.
  useEffect(() => {
    if (!activeVote || activeVote.stage !== 'voting') return;
    const check = () => {
      setActiveVote(v => {
        if (!v || v.stage !== 'voting') return v;
        if (Date.now() < v.windowEndsAt) return v;
        return { ...v, stage: 'locked' };
      });
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [activeVote?.nominationId, activeVote?.stage]);

  const castVote = useCallback(choice => {
    if (!activeVote) return;
    const wasGhost = activeVote.isGhostVote;
    post('/api/table/vote', { token, vote: choice }).then(r => {
      if (r.error) { showToast(r.error); return; }
      // A spent ghost vote can't be changed again — locks immediately
      // rather than waiting for the window's own countdown.
      setActiveVote(v => v && { ...v, myChoice: choice, stage: wasGhost ? 'locked' : v.stage });
    });
  }, [activeVote, token]);

  const revealVote = useCallback(() => {
    setActiveVote(v => v && { ...v, stage: 'revealed' });
    clearRevealTimer();
    revealTimerRef.current = setTimeout(() => {
      setActiveVote(null);
      setGhostVoteEnabled(false);
    }, 5000);
  }, []);

  const dismissReveal = useCallback(() => {
    clearRevealTimer();
    setActiveVote(null);
    setGhostVoteEnabled(false);
  }, []);

  useEffect(() => clearRevealTimer, []);

  return { activeVote, castVote, revealVote, dismissReveal, ghostVoteEnabled, setGhostVoteEnabled };
}
