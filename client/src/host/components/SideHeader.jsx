import Icon from './Icon.jsx';

/** The app's one persistent left column — brand, the Game/Toolkit
    switch, the phase pill, a narration slot (see below), and every
    header action, stacked vertically instead of the old full-width top
    bar. Moving it here is what actually fixed the ring colliding with
    the header on taller screens: the ring's own region no longer shares
    any vertical space with this column at all, they're just side by
    side now (see styles.css's own comment on `.ring` sizing).

    `narrationSlotRef` is a ref callback (same shape as App.jsx's own
    `registerRingSlot`) attached to a plain div here — each phase view's
    narration JSX is portaled into that node from GameStage.jsx, the same
    trick the ring already relied on, so narration can keep varying
    freely per phase/view without this column itself needing to
    remount. */
export default function SideHeader({
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
  narrationSlotRef,
}) {
  const locked = browsedMeta && browsedMeta.playable === false;
  const canStart = playerCount >= 5;

  return (
    <aside className="side-header">
      <div className="side-header-top">
        <span className="brand">
          <img className="mark" src="/icons/botc-logo.png" alt="Blood On The Clocktower" />
        </span>
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
      </div>

      {/* The per-view narration text (and anything that lives alongside
          it — VoiceVisualizer, WhimBeat, the day/night counter, ...)
          lands here, portaled in from whichever view is currently
          mounted. Growable — this is the column's main content. */}
      <div className="narration-slot" ref={narrationSlotRef} />

      <span className="phase">
        <Icon name={phaseIcon} size={14} />
        <span>{phaseLabel}</span>
      </span>

      <div className="side-header-actions">
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
        )}

        {browsing && browsedMeta && (
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
        )}

        {showGameControls && (
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
        )}

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
      </div>
    </aside>
  );
}
