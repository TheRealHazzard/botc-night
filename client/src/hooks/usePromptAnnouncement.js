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
    if (P.phase === 'night' && P.prompt && !P.submitted) {
      setText(`New prompt. ${P.prompt.text || 'Choose a target.'}`);
    } else if (P.result) {
      setText(`Result: ${P.result.title}. ${P.result.body}`);
    }
  }, [P?.phase, P?.prompt, P?.submitted, P?.result]);

  return text;
}
