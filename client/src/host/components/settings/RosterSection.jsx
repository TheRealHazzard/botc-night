export default function RosterSection({ config, phase, patch }) {
  const lobbyOnly = phase !== 'lobby';
  const disabled = (config.disabledCharacterIds || []).length > 0;

  return (
    <div className="settings-section">
      <h3>Roster</h3>
      <div className="settings-row">
        <div className="lbl">
          <b>Turn off Gossip, Savant, and Artist</b>
          <span>
            {lobbyOnly
              ? 'Only changeable before roles are dealt.'
              : 'The "ask/tell the Storyteller" characters — see Bucket 4 in ABILITY_PATTERNS.md.'}
          </span>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            disabled={lobbyOnly}
            checked={disabled}
            onChange={e => patch({ disabledCharacterIds: e.target.checked ? ['gossip', 'savant', 'artist'] : [] })}
          />
          <span className="track" />
        </label>
      </div>
    </div>
  );
}
