import ScriptBadge from './ScriptBadge.jsx';
import ScriptDifficultyRow from './ScriptDifficultyRow.jsx';

/** The left dashboard panel's script index while browsing — a plain
    scrollable list, click a row to browse it. Purely presentational:
    `browseIndex`/`onBrowse` are owned by App.jsx, which also composes
    the center preview and right-hand roster this list now shares the
    screen with (see ScriptBrowsePreview/ScriptBrowseRoster), and the
    header's Choose/Cancel actions. */
export default function ScriptSelectorList({ scripts, browseIndex, currentScriptId, onBrowse }) {
  if (!scripts || !scripts.length) return <div className="sub">Loading scripts…</div>;

  return (
    <div className="script-list">
      {scripts.map((m, i) => {
        const locked = m.playable === false;
        return (
          <button
            key={m.id}
            type="button"
            className={'script-list-row' + (i === browseIndex ? ' browsed' : '') + (locked ? ' locked' : '')}
            onClick={() => onBrowse(i)}
          >
            <ScriptBadge meta={m} />
            <div className="script-list-row-name">
              <h4>{m.name}</h4>
              <ScriptDifficultyRow meta={m} />
            </div>
            {m.id === currentScriptId && <span className="script-list-row-active-dot" title="Current script" />}
            {locked && <span className="badge-soon">Soon</span>}
          </button>
        );
      })}
    </div>
  );
}
