import { useEffect, useState } from 'react';

/** Text for a visually-hidden aria-live region on the host/storyteller
    screen — the host-side sibling of client/src/hooks/
    usePromptAnnouncement.js, same discipline: derive text only from
    values stable between re-renders of the SAME event (an id, a phase, a
    night number), never a ticking clock, so an unrelated SSE push or the
    live vote-count widget's own re-renders never re-trigger this.

    Nothing here exists on the player side: a player's own vote outcome
    is already a full-screen VoteRevealOverlay, hard to miss, so
    usePromptAnnouncement deliberately leaves it out — but the host
    dashboard has no equivalent affordance at all, and S.nominations
    already carries nomineeName/closed/yesCount unconditionally (never
    reveal-gated), so "opened" and "closed, N yes" are both cheap, real
    announcements worth having here specifically. */
export function useHostAnnouncement(S) {
  const [text, setText] = useState('');

  const openNom = S?.nominations?.find(n => n.day === S.nightNumber && !n.closed) || null;
  const lastClosedNom = S?.nominations
    ? [...S.nominations].reverse().find(n => n.day === S.nightNumber && n.closed)
    : null;

  useEffect(() => {
    if (!S) return;
    if (openNom) {
      setText(`A nomination is open on ${openNom.nomineeName}.`);
    } else if (lastClosedNom) {
      setText(`Nomination on ${lastClosedNom.nomineeName} closed — ${lastClosedNom.yesCount} yes.`);
    } else if (S.phase === 'night') {
      setText(`Night ${S.nightNumber} begins.`);
    } else if (S.phase === 'day') {
      setText(`Day ${S.nightNumber} begins.`);
    } else if (S.phase === 'reveal') {
      setText('The grimoire is revealed.');
    } else if (S.phase === 'over') {
      setText(S.victory ? `The game is over. ${S.victory.winner === 'good' ? 'Good' : 'Evil'} wins.` : 'The game is over.');
    }
  }, [S?.phase, S?.nightNumber, openNom?.id, lastClosedNom?.id, S?.victory?.winner]);

  return text;
}
