import ScriptBadge from './ScriptBadge.jsx';
import ScriptDifficultyPanel from './ScriptDifficultyPanel.jsx';
import ScriptGamesPanel from './ScriptGamesPanel.jsx';
import Icon from '../Icon.jsx';

/** The left dashboard panel's "normal" state — badge, name, the same
    difficulty/games-record panels, and a short description (the tagline
    only, meta.description). Used identically in the lobby (locked=false,
    "Change script" opens the selector) and in-game (locked=true, toggled
    in from the character roster tabs, "Change script" visibly disabled
    since the script can't change mid-game) — genuinely the same
    component, not two similar ones.

    `onChangeScript` is owned by whichever parent conditionally renders
    this vs. the browsing UI (LobbyView's 3-panel takeover, or
    GameLeftPanel's locked in-game view) — this component only ever asks
    to be swapped out, it doesn't own that toggle state itself. */
export default function ScriptViewPanel({ meta, locked = false, onChangeScript }) {
  return (
    <div className="script-view-panel">
      <ScriptBadge meta={meta} />
      <h3 className="script-view-name">{meta.name}</h3>
      <ScriptDifficultyPanel meta={meta} />
      <ScriptGamesPanel meta={meta} />
      <div className="desc">{meta.description || ''}</div>
      <button type="button" className={locked ? 'ghostbtn' : undefined} disabled={locked} onClick={onChangeScript}>
        <Icon name="scroll" size={15} /> Change script
      </button>
    </div>
  );
}
