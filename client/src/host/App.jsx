import { useEffect, useState } from "react";
import { useHostState } from "./hooks/useHostState.js";
import { useSoundEngine } from "./hooks/useSoundEngine.js";
import { usePhaseFade } from "./hooks/usePhaseFade.js";
import { useFullscreen } from "./hooks/useFullscreen.js";
import { useScripts } from "./hooks/useScripts.js";
import { useScriptRoster } from "./hooks/useScriptRoster.js";
import { useWakeLock } from "../hooks/useWakeLock.js";
import { useTextScale } from "../hooks/useTextScale.js";
import { post } from "../lib/api.js";
import { showToast } from "../lib/toast.js";
import { useWhimConfirm } from "./hooks/useWhimConfirm.js";
import { useHostAnnouncement } from "./hooks/useHostAnnouncement.js";
import { useBluffBeat } from "../hooks/useBluffBeat.js";
import Icon from "./components/Icon.jsx";
import ReclaimBanner from "./components/ReclaimBanner.jsx";
import FatalFlashOverlay from "./components/FatalFlashOverlay.jsx";
import WhimConfirmCard from "./components/WhimConfirmCard.jsx";
import ToastStack from "./components/ToastStack.jsx";
import BluffBeat from "../components/BluffBeat.jsx";
import SettingsOverlay from "./components/SettingsOverlay.jsx";
import ScriptBuilderOverlay from "./components/ScriptBuilderOverlay.jsx";
import ConfirmModal from "./components/ConfirmModal.jsx";
import LobbyView from "./views/LobbyView.jsx";
import RevealView from "./views/RevealView.jsx";
import NightView from "./views/NightView.jsx";
import DayView from "./views/DayView.jsx";
import OverView from "./views/OverView.jsx";
import ToolkitView from "./views/ToolkitView.jsx";

const PHASE_ICON = { night: "moon", day: "sun" };

export default function App() {
  const { S, patchConfig } = useHostState();
  const { muted, setMuted } = useSoundEngine();
  const {
    displayS,
    fading,
    transClass,
    fatalFlashing,
    blow,
    onFatalFlashDone,
  } = usePhaseFade(S, { muted });
  const fullscreen = useFullscreen();
  const scripts = useScripts();
  const scriptChars = useScriptRoster(displayS?.script);
  const { card: whimCard, dismiss: dismissWhimCard } = useWhimConfirm(displayS?.whimConfirmations);
  const bluffBeat = useBluffBeat(displayS?.bluffBeatAt);
  // Off raw S, not displayS — an accessibility announcement should fire
  // the moment the real state changes, not wait on usePhaseFade's own
  // purely-visual transition delay.
  const announcement = useHostAnnouncement(S);
  const { scale: textScale, cycle: cycleTextScale } = useTextScale();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [buildingScript, setBuildingScript] = useState(false);
  // One generic slot, not four booleans — only one of the app's
  // irreversible actions can ever be mid-confirm at a time. { message,
  // confirmLabel, onConfirm } | null; see ConfirmModal.jsx.
  const [pendingConfirm, setPendingConfirm] = useState(null);
  // Independent of the BOTC phase machine below — switching tabs never
  // touches `game` state, so an in-progress night is never at risk from a
  // peek at the toolkit, and the underlying phase/SSE stream keeps running
  // in the background regardless of which tab is showing.
  const [section, setSection] = useState("game");

  // Script browsing lives here, not in LobbyView, because its commit/back-
  // out actions now sit in the header — the one common ancestor of both
  // the header and LobbyView's own left/center panels.
  const [browsing, setBrowsing] = useState(false);
  const [browseIndex, setBrowseIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);

  useWakeLock(true); // the host's screen should always stay awake, unlike a player's phone

  // Browsing only ever makes sense in the lobby — if the phase moves on
  // (someone else started the game, say, while this browser had the
  // picker open) this state shouldn't linger and leave stale header
  // buttons behind once LobbyView itself has unmounted.
  useEffect(() => {
    if (displayS?.phase !== "lobby") {
      setBrowsing(false);
      setConfirming(false);
      setBuildingScript(false);
    }
  }, [displayS?.phase]);

  // The room's own color read shifts to match who actually won, once the
  // game is over — good tilts the whole screen blue, evil stays (and
  // sharpens) the oxblood it's had all along. Reverts the moment a new
  // game starts. Tracks `displayS`, not the live `S` — same as everything
  // else the fade holds back, this shouldn't shift before the reveal
  // itself is actually shown.
  useEffect(() => {
    const root = document.documentElement;
    if (displayS?.phase === "over" && displayS.victory) {
      root.style.setProperty(
        "--primary",
        displayS.victory.winner === "good"
          ? "var(--good)"
          : "var(--oxblood-hi)",
      );
      root.style.setProperty(
        "--primary-hi",
        displayS.victory.winner === "good" ? "var(--good-hi)" : "#c23438",
      );
    } else {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--primary-hi");
    }
  }, [displayS?.phase, displayS?.victory]);

  if (!displayS)
    return (
      <Header
        muted={muted}
        setMuted={setMuted}
        fullscreen={fullscreen}
        onOpenSettings={() => setSettingsOpen(true)}
        phaseLabel=""
        phaseIcon="clock"
      />
    );

  const activeScriptMeta =
    scripts && scripts.find(m => m.id === displayS.script);
  const browsedMeta = browsing && scripts && scripts[browseIndex];

  // Browsing always starts from "where we are now".
  const enterBrowse = () => {
    const i = (scripts || []).findIndex(m => m.id === displayS.script);
    setBrowseIndex(i === -1 ? 0 : i);
    setBrowsing(true);
  };
  const exitBrowse = () => setBrowsing(false);
  const confirmScript = () => {
    if (!browsedMeta || browsedMeta.playable === false) return;
    setConfirming(true);
    post("/api/table/script", { script: browsedMeta.id }).then(r => {
      if (r.error) {
        setConfirming(false);
        showToast(r.error);
        return;
      }
      setConfirming(false);
      exitBrowse();
    });
  };

  // Also header actions, alongside browsing's Play/Close — both pairs are
  // lobby-only and mutually exclusive (this one only when NOT browsing),
  // so they share the same header slot rather than doubling up controls.
  // Dealing is the one truly irreversible lobby action — unlike Clear the
  // lobby just below (easily repeated, nothing lost but seating), once
  // roles are dealt there's no way back to the lobby. This had no confirm
  // at all before, backwards from Clear the lobby having one for a far
  // less consequential action.
  const startGame = () => {
    setPendingConfirm({
      message: "Deal roles and start the game? This can't be undone.",
      confirmLabel: "Deal & start",
      onConfirm: () => {
        setPendingConfirm(null);
        post("/api/table/deal").then(r => r.error && showToast(r.error));
      },
    });
  };
  const clearLobby = () => {
    const n = displayS.players.length;
    setPendingConfirm({
      message: `Remove all ${n} seated player${n === 1 ? "" : "s"} and start the count over?`,
      confirmLabel: "Clear lobby",
      onConfirm: () => {
        setPendingConfirm(null);
        post("/api/table/clear-lobby").then(r => r.error && showToast(r.error));
      },
    });
  };

  // Reveal/New game used to also live in a per-phase sidepanel card, plus a
  // second, fully redundant copy behind a floating "Storyteller controls"
  // drawer tab — both on the same shared screen the table already watches,
  // so the drawer copy never actually bought any privacy. One copy, in the
  // header, alongside every other table-wide action.
  const revealAll = () => {
    setPendingConfirm({
      message: "End the game and reveal every role?",
      confirmLabel: "Reveal",
      onConfirm: () => {
        setPendingConfirm(null);
        post("/api/table/reveal");
      },
    });
  };
  const newGame = () => {
    setPendingConfirm({
      message: "Clear the table and start over?",
      confirmLabel: "Start over",
      onConfirm: () => {
        setPendingConfirm(null);
        post("/api/table/reset").then(() => location.reload());
      },
    });
  };

  const phaseLabel =
    displayS.phase === "night"
      ? `Night ${displayS.nightNumber}${displayS.wave === 2 ? " — again" : ""}`
      : displayS.phase === "day"
        ? `Day ${displayS.nightNumber}`
        : displayS.phase;

  const stageClass = "view" + (fading ? " fading trans-" + transClass : "");

  return (
    <>
      <div className="sr-only" aria-live="polite">{announcement}</div>
      <Header
        muted={muted}
        setMuted={setMuted}
        fullscreen={fullscreen}
        onOpenSettings={() => setSettingsOpen(true)}
        phaseLabel={phaseLabel}
        phaseIcon={PHASE_ICON[displayS.phase] || "clock"}
        section={section}
        onSection={setSection}
        browsing={section === "game" && displayS.phase === "lobby" && browsing}
        browsedMeta={browsedMeta}
        confirming={confirming}
        onConfirmScript={confirmScript}
        onCancelBrowse={exitBrowse}
        lobbyIdle={section === "game" && displayS.phase === "lobby" && !browsing}
        playerCount={displayS.players.length}
        onStartGame={startGame}
        onClearLobby={clearLobby}
        showGameControls={
          section === "game" &&
          (displayS.phase === "reveal" ||
            displayS.phase === "night" ||
            displayS.phase === "day" ||
            displayS.phase === "over" ||
            displayS.revealed)
        }
        onReveal={revealAll}
        onNewGame={newGame}
        onOpenHistory={() => window.open("/games", "_blank")}
        onOpenHallOfFame={() => window.open("/hall-of-fame", "_blank")}
        onOpenCharacters={() => window.open("/characters", "_blank")}
        textScale={textScale}
        onCycleTextScale={cycleTextScale}
      />

      <ReclaimBanner pendingReclaims={S?.pendingReclaims} />
      <ToastStack />

      <main>
        {section === "toolkit" ? (
          <ToolkitView />
        ) : (
          <div className={stageClass}>
            {displayS.phase === "lobby" && (
              <LobbyView
                players={displayS.players}
                script={displayS.script}
                scripts={scripts}
                setupRatio={displayS.setupRatio}
                browsing={browsing}
                browseIndex={browseIndex}
                browsedMeta={browsedMeta}
                onBrowse={setBrowseIndex}
                onEnterBrowse={enterBrowse}
                onBuildScript={() => setBuildingScript(true)}
              />
            )}
            {displayS.phase === "reveal" && (
              <RevealView
                players={displayS.players}
                scriptChars={scriptChars}
                activeScriptMeta={activeScriptMeta}
                muted={muted}
              />
            )}
            {displayS.phase === "night" && (
              <NightView
                players={displayS.players}
                nightNumber={displayS.nightNumber}
                wave={displayS.wave}
                windowEndsAt={displayS.windowEndsAt}
                windowTotalSeconds={displayS.windowTotalSeconds}
                config={displayS.config}
                script={displayS.script}
                scriptChars={scriptChars}
                activeScriptMeta={activeScriptMeta}
                muted={muted}
                log={displayS.log}
              />
            )}
            {displayS.phase === "day" && (
              <DayView
                players={displayS.players}
                nightNumber={displayS.nightNumber}
                deaths={displayS.deaths}
                nominations={displayS.nominations}
                config={displayS.config}
                script={displayS.script}
                scriptChars={scriptChars}
                activeScriptMeta={activeScriptMeta}
                muted={muted}
                log={displayS.log}
                dayStartedAt={displayS.dayStartedAt}
              />
            )}
            {(displayS.phase === "over" || displayS.revealed) && (
              <OverView
                players={displayS.players}
                victory={displayS.victory}
                gameSummary={displayS.gameSummary}
                log={displayS.log}
                actionLog={displayS.actionLog}
                resultsLog={displayS.resultsLog}
                nightNumber={displayS.nightNumber}
                muted={muted}
              />
            )}
          </div>
        )}
      </main>

      {fatalFlashing && (
        <FatalFlashOverlay blow={blow} onDone={onFatalFlashDone} />
      )}

      <WhimConfirmCard card={whimCard} onDismiss={dismissWhimCard} />
      <BluffBeat active={bluffBeat} />

      {settingsOpen && displayS.config && (
        <SettingsOverlay
          config={displayS.config}
          // The live phase, not displayS's — displayS is deliberately held
          // back for ~300ms during a phase-change fade (see usePhaseFade),
          // and RosterSection's lobby-only gate is a real safety check (a
          // PATCH is server-side no-op'd once phase !== 'lobby'), not a
          // cosmetic label — it shouldn't lag behind the actual game state
          // even briefly.
          phase={S?.phase}
          llmConfigured={displayS.llmConfigured}
          llmProvider={displayS.llmProvider}
          llmModel={displayS.llmModel}
          patchConfig={patchConfig}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {buildingScript && (
        <ScriptBuilderOverlay
          playerCount={displayS.players.length}
          onClose={() => setBuildingScript(false)}
          onCommitted={() => setBuildingScript(false)}
        />
      )}

      {pendingConfirm && (
        <ConfirmModal
          message={pendingConfirm.message}
          confirmLabel={pendingConfirm.confirmLabel}
          onConfirm={pendingConfirm.onConfirm}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </>
  );
}

function Header({
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
  onOpenHistory,
  onOpenHallOfFame,
  onOpenCharacters,
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
        {/* Every button in this row used to be one long, unbroken strip of
            icons with nothing but a hover tooltip to tell them apart — easy
            to lose count of which icon does what, especially the further
            right you go. Small uppercase captions split it into the same
            chunks a host already thinks in, without adding a word to every
            single button (see the roadmap's "header icon labeling" item). */}
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
            className={"mutebtn" + (muted ? "" : " on")}
            title={
              muted ? "Sound is off — tap to unmute" : "Sound is on — tap to mute"
            }
            onClick={() => setMuted(!muted)}
          >
            <Icon name={muted ? "speakerOff" : "speaker"} size={17} />
          </button>
        </span>
        {lobbyIdle && (
          <>
            <span className="header-divider" aria-hidden="true" />
            <span className="header-group">
              <span className="header-group-label">Reference</span>
              <button
                type="button"
                className="mutebtn"
                title="Game history"
                onClick={onOpenHistory}
              >
                <Icon name="scroll" size={17} />
              </button>
              <button
                type="button"
                className="mutebtn"
                title="Hall of Fame"
                onClick={onOpenHallOfFame}
              >
                <Icon name="trophy" size={17} />
              </button>
              <button
                type="button"
                className="mutebtn"
                title="Character checklist"
                onClick={onOpenCharacters}
              >
                <Icon name="check" size={17} />
              </button>
            </span>
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
        <span className="phase">
          <Icon name={phaseIcon} size={14} />
          <span>{phaseLabel}</span>
        </span>
      </span>
    </header>
  );
}
