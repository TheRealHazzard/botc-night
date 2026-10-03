import Icon from './Icon.jsx';

/** The app's one persistent top bar — brand, the Game/Toolkit switch,
    every header action, and the phase pill, laid out in a single
    full-width row. Narration text has no on-screen home at all any more
    (see GameStage.jsx's own comment) — this bar stays a clean, thin
    strip regardless of how much narration prose any given phase/view
    would otherwise have had to show. */
export default function Header({
  muted,
  setMuted,
  fullscreen,
  onOpenSettings,
  phaseLabel,
  phaseIcon,
  section,
  onSection,
  browsing,
  browsedMeta,
  confirming,
  onConfirmScript,
  onCancelBrowse,
  lobbyIdle,
  playerCount,
  onStartGame,
  onClearLobby,
  showGameControls,
  onReveal,
  onNewGame,
  onOpenReference,
  onOpenSimulate,
  textScale,
  onCycleTextScale,
}) {
  const locked = browsedMeta && browsedMeta.playable === false;
  const canStart = playerCount >= 5;

  return (
    <header>
      <span className="brand">
        <img className="mark" src="/icons/botc-logo.png" alt="Blood On The Clocktower" />
      </span>
      <span className="header-right">
        {onSection && (
          <span className="section-toggle">
            <button
              type="button"
              className={section === "game" ? "active" : ""}
              onClick={() => onSection("game")}
            >
              Game
            </button>
            <button
              type="button"
              className={section === "toolkit" ? "active" : ""}
              onClick={() => onSection("toolkit")}
            >
              Toolkit
            </button>
          </span>
        )}
        <span className="header-divider" aria-hidden="true" />
        <span className="header-group">
          <span className="header-group-label">Display</span>
          <button
            type="button"
            className="mutebtn"
            onClick={onCycleTextScale}
            aria-label={`Text size: ${Math.round(textScale * 100)}%. Tap to change.`}
          >
            Aa
          </button>
          <button
            type="button"
            className="mutebtn"
            title="Table settings"
            onClick={onOpenSettings}
          >
            <Icon name="gear" size={17} />
          </button>
          {fullscreen.supported && (
            <button
              type="button"
              className="mutebtn"
              title={
                fullscreen.isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
              }
              onClick={fullscreen.toggle}
            >
              <Icon
                name={fullscreen.isFullscreen ? "collapse" : "expand"}
                size={17}
              />
            </button>
          )}
          <button
            type="button"
            className="mutebtn"
            title="Open tabletop display — a big-text second screen for the table"
            onClick={() => window.open("/tabletop", "_blank")}
          >
            <Icon name="display" size={17} />
          </button>
          <button
            type="button"
            className="mutebtn"
            title="Open spectate link — a read-only narration feed to share with non-players"
            onClick={() => window.open("/spectate", "_blank")}
          >
            <Icon name="ghost" size={17} />
          </button>
          <button
            type="button"
            className={"mutebtn" + (muted ? "" : " on")}
            title={
              muted ? "Sound is off — tap to unmute" : "Sound is on — tap to mute"
            }
            onClick={() => setMuted(!muted)}
          >
            <Icon name={muted ? "speakerOff" : "speaker"} size={17} />
          </button>
        </span>
        <span className="header-divider" aria-hidden="true" />
        <span className="header-group">
          <span className="header-group-label">Reference</span>
          <button
            type="button"
            className="mutebtn"
            title="Reference — game history, Hall of Fame, characters, jinxes"
            onClick={onOpenReference}
          >
            <Icon name="scroll" size={17} />
          </button>
        </span>
        {lobbyIdle && (
          <>
            <span className="header-divider" aria-hidden="true" />
            <span className="header-group">
              <span className="header-group-label">Lobby</span>
              <button
                type="button"
                className="mutebtn"
                title="Clear the lobby"
                disabled={!playerCount}
                onClick={onClearLobby}
              >
                <Icon name="refresh" size={17} />
              </button>
              <button
                type="button"
                className={"mutebtn" + (canStart ? " on" : "")}
                title="Start Game"
                disabled={!canStart}
                onClick={onStartGame}
              >
                <Icon name="play" size={17} />
              </button>
            </span>
          </>
        )}
        {browsing && browsedMeta && (
          <>
            <span className="header-divider" aria-hidden="true" />
            <span className="header-group">
              <span className="header-group-label">Script</span>
              <button
                type="button"
                className={"mutebtn" + (locked ? "" : " on")}
                title={locked ? "Coming soon" : `Choose ${browsedMeta.name}`}
                disabled={locked || confirming}
                onClick={onConfirmScript}
              >
                <Icon name="play" size={17} />
              </button>
              <button
                type="button"
                className="mutebtn"
                title="Cancel — keep the current script"
                onClick={onCancelBrowse}
              >
                <Icon name="close" size={17} />
              </button>
            </span>
          </>
        )}
        {showGameControls && (
          <>
            <span className="header-divider" aria-hidden="true" />
            <span className="header-group">
              <span className="header-group-label">Storyteller</span>
              <button
                type="button"
                className="mutebtn"
                title="Reveal every role and end the game"
                onClick={onReveal}
              >
                <Icon name="eye" size={17} />
              </button>
              <button
                type="button"
                className="mutebtn"
                title="Clear the table and start a new game"
                onClick={onNewGame}
              >
                <Icon name="refresh" size={17} />
              </button>
            </span>
          </>
        )}
        <span className="header-divider" aria-hidden="true" />
        {/* Always visible, not gated to lobbyIdle like Reference above —
            starting a sim overwrites `game` itself, so a running sim is
            what Night/Day/Over are already showing; this has to stay
            reachable in any phase, not just an idle lobby. */}
        <span className="header-group">
          <span className="header-group-label">Testing</span>
          <button
            type="button"
            className="mutebtn"
            title="Dry Run — watch a table of bots play a full game"
            onClick={onOpenSimulate}
          >
            <Icon name="dice" size={17} />
          </button>
        </span>
        <span className="header-divider" aria-hidden="true" />
        <span className="phase">
          <Icon name={phaseIcon} size={14} />
          <span>{phaseLabel}</span>
        </span>
      </span>
    </header>
  );
}
