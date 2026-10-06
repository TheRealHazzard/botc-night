import ScriptBadge from './ScriptBadge.jsx';
import ScriptDifficultyPanel from './ScriptDifficultyPanel.jsx';
import ScriptGamesPanel from './ScriptGamesPanel.jsx';
import FeaturedRoleCard from './FeaturedRoleCard.jsx';
import Icon from '../Icon.jsx';

/** The Script tab's "normal" state — badge, name, the same
    difficulty/games-record panels, and a short description (the tagline
    only, meta.description). Used identically in the lobby (locked=false,
    "Change script" opens the selector) and in-game (locked=true, as the
    Script tab beside Characters/Controls, "Change script" visibly
    disabled since the script can't change mid-game) — genuinely the
    same component, not two similar ones.

    FeaturedRoleCard was previously only ever reachable from the lobby's
    own script-browsing takeover (ScriptBrowsePreview) — once a game
    actually started, the Script tab's own "normal" state here never
    showed it at all, even though meta.featuredCharacter is the exact
    same field either way. Same spotlight, now visible for the whole
    game, not just while picking a script.

    `onChangeScript` is owned by whichever parent conditionally renders
    this vs. the browsing UI (LobbyView's 3-panel takeover, or a phase
    view's own locked Script tab) — this component only ever asks to be
    swapped out, it doesn't own that toggle state itself. */
export default function ScriptViewPanel({ meta, locked = false, onChangeScript, onBuildScript }) {
  return (
    <div className="script-view-panel">
      <ScriptBadge meta={meta} />
      <h3 className="script-view-name">{meta.name}</h3>
      <ScriptDifficultyPanel meta={meta} />
      <ScriptGamesPanel meta={meta} />
      <div className="desc">{meta.description || ''}</div>
      {meta.featuredCharacter && <FeaturedRoleCard character={meta.featuredCharacter} />}
      <button type="button" className={locked ? 'ghostbtn' : undefined} disabled={locked} onClick={onChangeScript}>
        <Icon name="scroll" size={15} /> Change script
      </button>
      {onBuildScript && (
        <button type="button" className={locked ? 'ghostbtn' : undefined} disabled={locked} onClick={onBuildScript}>
          <Icon name="dice" size={15} /> Build a script
        </button>
      )}
    </div>
  );
}
