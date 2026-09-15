import { useState } from 'react';
import Icon from '../Icon.jsx';
import SidepanelCard from '../SidepanelCard.jsx';

const STORAGE_KEY = 'botc-toolkit-randomizer-entries';
const DEFAULT_TEXT = 'Alex\nSam\nJordan\nCasey';

/** Picks one line at random from a newline-separated list — who goes
    first, team assignments, a random prompt. Entries persist across
    reloads (localStorage, same bare get/set pattern as useSoundEngine's
    mute flag — no shared hook needed for one key) so a table doesn't
    need retyping the same names every night. */
export default function RandomizerTool() {
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_TEXT; } catch { return DEFAULT_TEXT; }
  });
  const [pickedIndex, setPickedIndex] = useState(null);

  const entries = text.split('\n').map(s => s.trim()).filter(Boolean);

  const updateText = next => {
    setText(next);
    setPickedIndex(null);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private-browsing or full storage — the list just won't survive a reload */ }
  };

  const spin = () => {
    if (!entries.length) return;
    setPickedIndex(Math.floor(Math.random() * entries.length));
  };

  return (
    <SidepanelCard icon="dice" title="Randomizer">
      <textarea
        className="toolkit-textarea"
        rows={6}
        value={text}
        onChange={e => updateText(e.target.value)}
        placeholder="One entry per line"
      />
      <div className="sub">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</div>
      {pickedIndex !== null && entries[pickedIndex] && (
        <div className="toolkit-pick">{entries[pickedIndex]}</div>
      )}
      <button type="button" className="ghost" onClick={spin} disabled={!entries.length}>
        <Icon name="dice" size={14} /> Pick
      </button>
    </SidepanelCard>
  );
}
