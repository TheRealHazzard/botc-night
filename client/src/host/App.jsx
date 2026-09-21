import { useEffect, useState } from "react";
import { useHostState } from "./hooks/useHostState.js";
import { useSoundEngine } from "./hooks/useSoundEngine.js";
import { usePhaseFade } from "./hooks/usePhaseFade.js";
import { useFullscreen } from "./hooks/useFullscreen.js";
import { useScripts } from "./hooks/useScripts.js";
import { useScriptRoster } from "./hooks/useScriptRoster.js";
import { useWakeLock } from "../hooks/useWakeLock.js";
import { post } from "../lib/api.js";
import { useWhimConfirm } from "./hooks/useWhimConfirm.js";
import Icon from "./components/Icon.jsx";
import ReclaimBanner from "./components/ReclaimBanner.jsx";
import FatalFlashOverlay from "./components/FatalFlashOverlay.jsx";
import WhimConfirmCard from "./components/WhimConfirmCard.jsx";
import SettingsOverlay from "./components/SettingsOverlay.jsx";
import ScriptBuilderOverlay from "./components/ScriptBuilderOverlay.jsx";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [buildingScript, setBuildingScript] = useState(false);
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
        alert(r.error);
        return;
      }
      setConfirming(false);
      exitBrowse();
    });
  };

  // Also header actions, alongside browsing's Play/Close — both pairs are
  // lobby-only and mutually exclusive (this one only when NOT browsing),
  // so they share the same header slot rather than doubling up controls.
  const startGame = () => post("/api/table/deal").then(r => r.error && alert(r.error));
  const clearLobby = () => {
    const n = displayS.players.length;
    if (!confirm(`Remove all ${n} seated player${n === 1 ? "" : "s"} and start the count over?`)) return;
    post("/api/table/clear-lobby").then(r => r.error && alert(r.error));
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
        onOpenHistory={() => window.open("/games", "_blank")}
        onOpenHallOfFame={() => window.open("/hall-of-fame", "_blank")}
      />

      <ReclaimBanner pendingReclaims={S?.pendingReclaims} />

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
                mastermindExtraDay={displayS.mastermindExtraDay}
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
  onOpenHistory,
  onOpenHallOfFame,
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
        {lobbyIdle && (
          <>
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
          </>
        )}
        {browsing && browsedMeta && (
          <>
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
          </>
        )}
        <span className="phase">
          <Icon name={phaseIcon} size={14} />
          <span>{phaseLabel}</span>
        </span>
      </span>
    </header>
  );
}
