import { useState } from 'react';
import ScriptViewPanel from './script/ScriptViewPanel.jsx';
import ScriptRosterCard from './ScriptRosterCard.jsx';

/** The in-game left panel: the character roster by default, or — toggled
    via the small tab pair above it — the same ScriptViewPanel the lobby
    uses, locked since the script can't change mid-game. One shared
    component rather than repeating the tab-plus-toggle logic at each of
    the three call sites (reveal/night/day) that want it.

    `leftPanelAlt` is local state here, not a prop — a fresh mount (which
    every phase transition naturally gives this, since each phase is its
    own view component) already resets it to false for free, replacing
    the vanilla's manual "reset on phase change" block. */
export default function GameLeftPanel({ scriptChars, activeScriptMeta }) {
  const [alt, setAlt] = useState(false);

  return (
    <div className="sidepanel">
      <div className="panel-tabs">
        <button type="button" className={'panel-tab' + (alt ? '' : ' active')} onClick={() => setAlt(false)}>
          Characters
        </button>
        <button type="button" className={'panel-tab' + (alt ? ' active' : '')} onClick={() => setAlt(true)}>
          Script
        </button>
      </div>
      {alt && activeScriptMeta ? (
        <ScriptViewPanel meta={activeScriptMeta} locked />
      ) : (
        <ScriptRosterCard characters={scriptChars} />
      )}
    </div>
  );
}
