import { useState } from 'react';
import Icon from '../Icon.jsx';
import SidepanelCard from '../SidepanelCard.jsx';

const STORAGE_KEY = 'botc-toolkit-trivia-deck';
const DEFAULT_TEXT = [
  'What year was Blood on the Clocktower first released? | 2022',
  'What color is the Demon\'s token bag trimmed in? | Red',
  'How many players does the smallest legal game need? | 5',
].join('\n');

function parseDeck(text) {
  return text
    .split('\n')
    .map(line => line.split('|'))
    .filter(parts => parts.length >= 2 && parts[0].trim() && parts.slice(1).join('|').trim())
    .map(([q, ...rest]) => ({ question: q.trim(), answer: rest.join('|').trim() }));
}

// Fisher-Yates — an unbiased shuffle, not Array.sort(() => Math.random()-0.5)'s
// well-known skew.
function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** A quizmaster deck: paste `question | answer` pairs (one per line), step
    through them, reveal on demand. Deck text persists to localStorage (same
    bare pattern as RandomizerTool/useSoundEngine) so it survives a reload;
    the shuffled play order is deliberately NOT persisted — a fresh mount
    (new game night) reshuffles from the saved deck text instead of resuming
    mid-deck, which is what you want after closing and reopening days later. */
export default function TriviaTool() {
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_TEXT; } catch { return DEFAULT_TEXT; }
  });
  const deck = parseDeck(text);
  const [order, setOrder] = useState(() => shuffle(deck.map((_, i) => i)));
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(deck.length === 0);

  const updateText = next => {
    setText(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private-browsing or full storage — the deck just won't survive a reload */ }
  };

  const reshuffle = () => {
    setOrder(shuffle(parseDeck(text).map((_, i) => i)));
    setPos(0);
    setRevealed(false);
  };

  const finishEditing = () => {
    setEditing(false);
    reshuffle();
  };

  const next = () => {
    setRevealed(false);
    setPos(p => (p + 1) % order.length);
  };

  // Reaching the play branch below always implies a non-empty deck: editing
  // starts true whenever the saved deck is empty, and finishEditing's Start
  // button is disabled until there's at least one card — so `editing` only
  // ever turns false with order.length (and thus `current`) already set.
  const current = editing ? null : deck[order[pos]];

  return (
    <SidepanelCard icon="bulb" title="Trivia">
      {editing ? (
        <>
          <textarea
            className="toolkit-textarea"
            rows={8}
            value={text}
            onChange={e => updateText(e.target.value)}
            placeholder="One per line: question | answer"
          />
          <button type="button" className="ghost" onClick={finishEditing} disabled={!deck.length}>
            <Icon name="check" size={14} /> Start deck ({deck.length} card{deck.length === 1 ? '' : 's'})
          </button>
        </>
      ) : (
        <>
          <div className="sub">Card {pos + 1} of {order.length}</div>
          <div className="toolkit-pick toolkit-trivia-q">{current.question}</div>
          {revealed && <div className="toolkit-trivia-a">{current.answer}</div>}
          <div className="sidepanel-actions-row">
            {!revealed ? (
              <button type="button" className="ghost" onClick={() => setRevealed(true)}>
                <Icon name="eye" size={14} /> Reveal
              </button>
            ) : (
              <button type="button" className="ghost" onClick={next}>
                <Icon name="play" size={14} /> Next
              </button>
            )}
            <button type="button" className="ghostbtn" onClick={reshuffle}>
              <Icon name="refresh" size={14} /> Reshuffle
            </button>
          </div>
          <button type="button" className="ghostbtn" onClick={() => setEditing(true)}>
            <Icon name="scroll" size={14} /> Edit deck
          </button>
        </>
      )}
    </SidepanelCard>
  );
}
