import { useEffect, useState } from 'react';

/** Text for a visually-hidden aria-live region — deliberately narrow: only
    "a new prompt opened" or "a new result arrived", never the whole app's
    worth of re-renders. Wrapping all of PlayerApp in one aria-live region
    was the first draft here, and it was wrong — NightPromptCard's own
    countdown ticks every second, and a screen reader would have announced
    that tick right along with everything else. This hook only ever derives
    its text from content that's stable between re-renders of the SAME
    prompt/result (the prompt's instructional text, the result's title/
    body) — setting state to an identical string is a React no-op, so an
    unrelated SSE push that leaves the actual prompt/result unchanged never
    re-triggers the announcement, with no explicit dedup key needed. */
export function usePromptAnnouncement(P) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (!P) return;
    // Most specific/actionable first — a real prompt, a fresh result, or
    // an open vote all outrank the plain fact that a phase changed.
    if (P.phase === 'night' && P.prompt && !P.submitted) {
      setText(`New prompt. ${P.prompt.text || 'Choose a target.'}`);
    } else if (P.result) {
      setText(`Result: ${P.result.title}. ${P.result.body}`);
    } else if (P.voteRequest) {
      setText(`A nomination is open on ${P.voteRequest.nomineeName}.`);
    } else if (P.phase === 'night' && !P.prompt) {
      // Only for a player with truly nothing to do tonight (dead, or a
      // passive character) — one who already submitted a real prompt
      // falls through to here too once `submitted` flips, and re-greeting
      // "Night falls" right as they finish acting would be a spurious,
      // mid-action announcement, not the entry beat this is meant to be.
      setText('Night falls.');
    } else if (P.phase === 'day') {
      setText('Day begins.');
    } else if (P.phase === 'reveal') {
      setText('The grimoire is revealed.');
    }
  }, [P?.phase, P?.prompt, P?.submitted, P?.result, P?.voteRequest?.nominationId]);

  return text;
}
