import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App.jsx";
import { mockFetch, lastBody } from "../../test/fetchMock.js";
import {
  installFakeAudioContext,
  resetAudioCalls,
  toneCalls,
  noiseCalls,
} from "../../test/fakeAudioContext.js";

const hostState = vi.hoisted(() => ({
  current: { S: null, patchConfig: vi.fn() },
}));
const soundEngine = vi.hoisted(() => ({
  current: { muted: false, setMuted: vi.fn() },
}));
const fullscreenState = vi.hoisted(() => ({
  current: { supported: false, isFullscreen: false, toggle: vi.fn() },
}));

vi.mock("./hooks/useHostState.js", () => ({
  useHostState: () => hostState.current,
}));
vi.mock("./hooks/useSoundEngine.js", () => ({
  useSoundEngine: () => soundEngine.current,
}));
vi.mock("./hooks/useFullscreen.js", () => ({
  useFullscreen: () => fullscreenState.current,
}));

function baseS(overrides = {}) {
  return {
    phase: "lobby",
    nightNumber: 0,
    wave: 0,
    script: "tb",
    windowEndsAt: null,
    config: {
      windowSeconds: 60,
      wave2Seconds: 20,
      voteWindowSeconds: 20,
      hintNights: [],
      dramaBias: 0.5,
      recluseRegistersEvil: 0.5,
      mayorRedirectChance: 0.5,
      shabalothRegurgitateChance: 0.5,
      pacifistSaveChance: 0.5,
      tinkerDeathChance: 0.1,
      madExecutionChance: 0.3,
      disabledCharacterIds: [],
      llmStorytellerEnabled: false,
    },
    players: [],
    deaths: [],
    nominations: [],
    mastermindExtraDay: false,
    victory: null,
    revealed: false,
    gameSummary: null,
    log: [],
    actionLog: [],
    pendingReclaims: [],
    llmConfigured: false,
    ...overrides,
  };
}

const SCRIPTS = [
  {
    id: "tb",
    name: "Trouble Brewing",
    difficulty: 1,
    playable: true,
    description: "x",
    decidedGames: 0,
    characters: [{ id: "washerwoman", name: "Washerwoman", team: "townsfolk" }],
  },
  {
    id: "bmr",
    name: "Bad Moon Rising",
    difficulty: 2,
    playable: true,
    description: "x",
    decidedGames: 0,
    characters: [],
  },
  {
    id: "lunar-eclipse",
    name: "Lunar Eclipse",
    difficulty: 4,
    playable: false,
    description: "x",
    decidedGames: 0,
    characters: [],
  },
];

describe("App", () => {
  beforeEach(() => {
    localStorage.clear(); // useTextScale persists here, same key/hook the player app already ships
    hostState.current = { S: null, patchConfig: vi.fn() };
    soundEngine.current = { muted: false, setMuted: vi.fn() };
    fullscreenState.current = {
      supported: false,
      isFullscreen: false,
      toggle: vi.fn(),
    };
    // useScripts() caches /api/scripts at module scope for this whole test
    // file, not per-test — whichever mock is active on the first render
    // that actually needs it is what every later test sees too. Use the
    // real SCRIPTS fixture everywhere so the browsing tests further down
    // this file don't silently get stuck with an empty list.
    mockFetch({
      "/api/tokens": {},
      "/trivia.json": [],
      "/api/scripts": SCRIPTS,
      "/api/join-address": { url: "http://192.168.1.5:3000" },
    });
    installFakeAudioContext(); // usePhaseFade's phase-entry sound cues need a real AudioContext, jsdom has none
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the header even before any state has loaded", () => {
    render(<App />);
    expect(screen.getByAltText("Blood On The Clocktower")).toBeInTheDocument();
  });

  it("the Aa button cycles the host's own text size, available in every phase (not lobby-gated like history/hall of fame)", async () => {
    hostState.current.S = baseS({ phase: "night", nightNumber: 1 });
    render(<App />);
    const btn = screen.getByText("Aa");
    expect(btn).toHaveAccessibleName(/100%/);
    await userEvent.click(btn);
    expect(btn).toHaveAccessibleName(/115%/);
  });

  it("dispatches to the lobby view once state loads, showing the phase pill", () => {
    hostState.current.S = baseS();
    render(<App />);
    expect(screen.getByText("The town is still empty.")).toBeInTheDocument();
    expect(screen.getByText("lobby")).toBeInTheDocument();
  });

  it("dispatches to the day view with the right phase label", () => {
    hostState.current.S = baseS({
      phase: "day",
      nightNumber: 3,
      players: [
        {
          id: "p1",
          name: "Ada",
          alive: true,
          connected: true,
          ghostVoteUsed: false,
          color: null,
        },
      ],
    });
    render(<App />);
    // "Day 3" legitimately appears twice — the header's phase pill and the
    // in-stage DayCounterLabel are two separate, both-correct occurrences.
    expect(screen.getAllByText("Day 3")).toHaveLength(2);
    expect(
      screen.getByText("Everyone wakes. That should worry you."),
    ).toBeInTheDocument();
  });

  it("the mute button reflects and toggles the sound engine state", async () => {
    soundEngine.current = { muted: true, setMuted: vi.fn() };
    hostState.current.S = baseS();
    render(<App />);
    const muteBtn = screen.getByTitle(/sound is off/i);
    await userEvent.click(muteBtn);
    expect(soundEngine.current.setMuted).toHaveBeenCalledWith(false);
  });

  it("the fullscreen button is hidden entirely when unsupported", () => {
    hostState.current.S = baseS();
    render(<App />);
    expect(screen.queryByTitle(/fullscreen/i)).not.toBeInTheDocument();
  });

  it("shows the fullscreen button when supported, and toggles it", async () => {
    fullscreenState.current = {
      supported: true,
      isFullscreen: false,
      toggle: vi.fn(),
    };
    hostState.current.S = baseS();
    render(<App />);
    const btn = screen.getByTitle("Enter fullscreen");
    await userEvent.click(btn);
    expect(fullscreenState.current.toggle).toHaveBeenCalledTimes(1);
  });

  it("opens and closes the settings overlay from the gear button", async () => {
    hostState.current.S = baseS();
    render(<App />);
    await userEvent.click(screen.getByTitle("Table settings"));
    expect(
      screen.getByText("Table settings", { selector: "h2" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByText("Close"));
    expect(
      screen.queryByText("Table settings", { selector: "h2" }),
    ).not.toBeInTheDocument();
  });

  it("the reclaim banner shows regardless of which phase view is underneath", () => {
    hostState.current.S = baseS({
      phase: "night",
      wave: 1,
      pendingReclaims: [{ requestId: "r1", name: "Bo" }],
    });
    render(<App />);
    expect(screen.getByText(/reconnect as bo/i)).toBeInTheDocument();
  });

  it("sets the --primary CSS vars on a good win, clears them once back in the lobby", () => {
    // Reduced motion so displayS updates immediately instead of behind
    // usePhaseFade's own transition delay — that timing is already covered
    // by usePhaseFade.test.jsx; this test only cares about the CSS-var
    // effect tracking whatever displayS currently is.
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    hostState.current.S = baseS({
      phase: "over",
      victory: { winner: "good", reason: "x" },
    });
    const { rerender } = render(<App />);
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe(
      "var(--good)",
    );

    hostState.current.S = baseS({ phase: "lobby" });
    rerender(<App />);
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe(
      "",
    );
  });

  // A full evil-win reveal exercised together, as one scenario — the old
  // dom-shim suite only ever checked playVictory('evil')'s call shape in
  // isolation, never a real render alongside it. No pickable fatal blow
  // here (no deaths) so this is the plain "over, no blow" path — the
  // fatal-blow-flash path itself is covered separately and in depth by
  // usePhaseFade.test.jsx and useFatalBlowSequencer.test.jsx.
  it('a full evil-win reveal: win-condition text in "dread" styling + the ring glowing oxblood + oxblood CSS vars + the victory sound cue, all together', () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    hostState.current.S = baseS({ phase: "day" });
    const { rerender } = render(<App />);
    resetAudioCalls();

    hostState.current.S = baseS({
      phase: "over",
      revealed: true,
      victory: { winner: "evil", reason: "The town executed a Townsfolk." },
      gameSummary: {
        nominations: 2,
        voteAccuracy: 0.5,
        ghostVotesUsed: 0,
        ghostVotesEligible: 1,
        longestSurvivingEvil: { name: "Imp", survived: true },
      },
      players: [
        {
          id: "p1",
          name: "Ada",
          alive: false,
          connected: true,
          character: "Imp",
          color: null,
        },
      ],
    });
    rerender(<App />);

    expect(
      screen.getByText("The town executed a Townsfolk."),
    ).toHaveClass("dread");
    expect(document.querySelector(".ring")).toHaveClass("glow-evil");

    expect(document.documentElement.style.getPropertyValue("--primary")).toBe(
      "var(--oxblood-hi)",
    );
    expect(
      document.documentElement.style.getPropertyValue("--primary-hi"),
    ).toBe("#c23438");

    // playVictory('evil'): low dissonant cluster + a rumble, no exception.
    expect(toneCalls.length).toBeGreaterThan(0);
    expect(noiseCalls.length).toBeGreaterThan(0);
    expect(toneCalls.every(c => c.freq < 100)).toBe(true);
  });

  describe("script browsing: commit/back-out live in the header, not the lobby panels", () => {
    beforeEach(() => {
      mockFetch({
        "/api/tokens": {},
        "/trivia.json": [],
        "/api/scripts": SCRIPTS,
        "/api/join-address": { url: "http://192.168.1.5:3000" },
      });
      hostState.current.S = baseS();
    });

    it("Change script reveals header Play/Close buttons, positioned before the phase pill", async () => {
      render(<App />);
      await userEvent.click(screen.getByText(/change script/i));
      const playBtn = screen.getByTitle(/choose trouble brewing/i);
      const closeBtn = screen.getByTitle(/cancel/i);
      expect(playBtn).toBeInTheDocument();
      expect(closeBtn).toBeInTheDocument();
      // Both sit before the phase pill in DOM order (i.e. "to its left").
      const phasePill = screen.getByText("lobby");
      expect(
        playBtn.compareDocumentPosition(phasePill) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        closeBtn.compareDocumentPosition(phasePill) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("no header Play/Close buttons outside of browsing", () => {
      render(<App />);
      expect(screen.queryByTitle(/cancel/i)).not.toBeInTheDocument();
    });

    it("Close (header) exits browsing, restoring the normal lobby view", async () => {
      render(<App />);
      await userEvent.click(screen.getByText(/change script/i));
      await userEvent.click(screen.getByTitle(/cancel/i));
      expect(screen.getByTitle("Start Game")).toBeInTheDocument();
      expect(screen.queryByTitle(/cancel/i)).not.toBeInTheDocument();
    });

    it("Play (header) posts the browsed script and returns to the normal lobby view", async () => {
      const fetchMock = mockFetch({
        "/api/tokens": {},
        "/trivia.json": [],
        "/api/scripts": SCRIPTS,
        "/api/table/script": {},
      });
      render(<App />);
      await userEvent.click(screen.getByText(/change script/i));
      await userEvent.click(screen.getByText("Bad Moon Rising")); // browse a different script
      await userEvent.click(screen.getByTitle(/choose bad moon rising/i));
      await vi.waitFor(() =>
        expect(lastBody(fetchMock, "/api/table/script")).toEqual({
          script: "bmr",
        }),
      );
      await vi.waitFor(() =>
        expect(screen.getByTitle("Start Game")).toBeInTheDocument(),
      );
    });

    it("a locked browsed script disables the header Play button", async () => {
      render(<App />);
      await userEvent.click(screen.getByText(/change script/i));
      await userEvent.click(screen.getByText("Lunar Eclipse"));
      expect(screen.getByTitle("Coming soon")).toBeDisabled();
    });

    it("a failed confirm toasts and stays in browsing mode", async () => {
      mockFetch({
        "/api/tokens": {},
        "/trivia.json": [],
        "/api/scripts": SCRIPTS,
        "/api/table/script": { error: "Game already started." },
      });
      render(<App />);
      await userEvent.click(screen.getByText(/change script/i));
      await userEvent.click(screen.getByTitle(/choose trouble brewing/i));
      expect(await screen.findByText("Game already started.")).toBeInTheDocument();
      expect(screen.getByTitle(/choose trouble brewing/i)).toBeInTheDocument(); // still browsing
    });

    it("leaving the lobby phase clears browsing state so no stale header buttons linger", async () => {
      // Reduced motion so the phase transition applies immediately instead
      // of behind usePhaseFade's own delay — irrelevant to what this test
      // is actually checking (browsing-state cleanup on phase change).
      vi.stubGlobal("matchMedia", () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
      const { rerender } = render(<App />);
      await userEvent.click(screen.getByText(/change script/i));
      expect(screen.getByTitle(/cancel/i)).toBeInTheDocument();

      hostState.current.S = baseS({ phase: "night", wave: 1 });
      rerender(<App />);
      expect(screen.queryByTitle(/cancel/i)).not.toBeInTheDocument();
    });
  });

  describe("lobby actions (Start Game/Clear the lobby/Game history) live in the header too", () => {
    beforeEach(() => {
      hostState.current.S = baseS();
    });

    it("Start Game is disabled under 5 players, Clear the lobby is disabled with none seated", () => {
      render(<App />);
      expect(screen.getByTitle("Start Game")).toBeDisabled();
      expect(screen.getByTitle(/clear the lobby/i)).toBeDisabled();
    });

    it("Start Game enables at 5+ players, confirms, and posts /api/table/deal", async () => {
      const players = Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
        alive: true,
        connected: true,
        color: null,
      }));
      const fetchMock = mockFetch({
        "/api/tokens": {},
        "/trivia.json": [],
        "/api/scripts": SCRIPTS,
        "/api/table/deal": {},
      });
      hostState.current.S = baseS({ players });
      render(<App />);
      const start = screen.getByTitle("Start Game");
      expect(start).toBeEnabled();
      await userEvent.click(start);
      await userEvent.click(screen.getByRole("button", { name: "Deal & start" }));
      await vi.waitFor(() =>
        expect(
          fetchMock.calls.some(c => c.url.includes("/api/table/deal")),
        ).toBe(true),
      );
    });

    it("declining Start Game's confirm never posts /api/table/deal", async () => {
      const players = Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
        alive: true,
        connected: true,
        color: null,
      }));
      const fetchMock = mockFetch({
        "/api/tokens": {},
        "/trivia.json": [],
        "/api/scripts": SCRIPTS,
        "/api/table/deal": {},
      });
      hostState.current.S = baseS({ players });
      render(<App />);
      await userEvent.click(screen.getByTitle("Start Game"));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(
        fetchMock.calls.some(c => c.url.includes("/api/table/deal")),
      ).toBe(false);
      expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    });

    it("Clear the lobby confirms, and only posts on accept", async () => {
      const players = [
        { id: "p1", name: "Ada", alive: true, connected: true, color: null },
      ];
      const fetchMock = mockFetch({
        "/api/tokens": {},
        "/trivia.json": [],
        "/api/scripts": SCRIPTS,
        "/api/table/clear-lobby": {},
      });
      hostState.current.S = baseS({ players });
      render(<App />);
      await userEvent.click(screen.getByTitle(/clear the lobby/i));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(
        fetchMock.calls.some(c => c.url.includes("/api/table/clear-lobby")),
      ).toBe(false);

      await userEvent.click(screen.getByTitle(/clear the lobby/i));
      await userEvent.click(screen.getByRole("button", { name: "Clear lobby" }));
      await vi.waitFor(() =>
        expect(
          fetchMock.calls.some(c => c.url.includes("/api/table/clear-lobby")),
        ).toBe(true),
      );
    });

    it("Game history opens /games in a new tab", async () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => {});
      render(<App />);
      await userEvent.click(screen.getByTitle("Game history"));
      expect(openSpy).toHaveBeenCalledWith("/games", "_blank");
    });

    it("Hall of Fame opens /hall-of-fame in a new tab", async () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => {});
      render(<App />);
      await userEvent.click(screen.getByTitle("Hall of Fame"));
      expect(openSpy).toHaveBeenCalledWith("/hall-of-fame", "_blank");
    });

    it("Character checklist opens /characters in a new tab", async () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => {});
      render(<App />);
      await userEvent.click(screen.getByTitle("Character checklist"));
      expect(openSpy).toHaveBeenCalledWith("/characters", "_blank");
    });

    it("Start/Clear/History are hidden while browsing scripts, and reappear on Close", async () => {
      render(<App />);
      await userEvent.click(screen.getByText(/change script/i));
      expect(screen.queryByTitle("Start Game")).not.toBeInTheDocument();
      expect(screen.queryByTitle(/clear the lobby/i)).not.toBeInTheDocument();
      expect(screen.queryByTitle("Game history")).not.toBeInTheDocument();

      await userEvent.click(screen.getByTitle(/cancel/i));
      expect(screen.getByTitle("Start Game")).toBeInTheDocument();
      expect(screen.getByTitle(/clear the lobby/i)).toBeInTheDocument();
      expect(screen.getByTitle("Game history")).toBeInTheDocument();
    });

    it("hidden entirely outside the lobby phase", () => {
      hostState.current.S = baseS({ phase: "day", nightNumber: 1 });
      render(<App />);
      expect(screen.queryByTitle("Start Game")).not.toBeInTheDocument();
      expect(screen.queryByTitle(/clear the lobby/i)).not.toBeInTheDocument();
      expect(screen.queryByTitle("Game history")).not.toBeInTheDocument();
    });
  });

  // Reveal/New game used to also live in a per-phase sidepanel card, plus a
  // second, fully redundant copy behind a floating drawer tab — both on the
  // same shared screen already showing the header. One copy now, here.
  describe("Reveal/New game live in the header during an in-progress game, not the lobby", () => {
    it("hidden during the lobby phase", () => {
      render(<App />);
      expect(screen.queryByTitle(/reveal every role/i)).not.toBeInTheDocument();
      expect(screen.queryByTitle(/start a new game/i)).not.toBeInTheDocument();
    });

    it("shown during night/day/reveal/over", () => {
      for (const phase of ["reveal", "night", "day", "over"]) {
        hostState.current.S = baseS({ phase, nightNumber: 1 });
        const { unmount } = render(<App />);
        expect(screen.getByTitle(/reveal every role/i)).toBeInTheDocument();
        expect(screen.getByTitle(/start a new game/i)).toBeInTheDocument();
        unmount();
      }
    });

    it("also shown once revealed, even if phase somehow isn't literally 'over'", () => {
      hostState.current.S = baseS({ phase: "day", nightNumber: 1, revealed: true });
      render(<App />);
      expect(screen.getByTitle(/reveal every role/i)).toBeInTheDocument();
    });

    it("Reveal confirms, and only posts /api/table/reveal on accept", async () => {
      const fetchMock = mockFetch({
        "/api/tokens": {},
        "/trivia.json": [],
        "/api/scripts": SCRIPTS,
        "/api/table/reveal": {},
      });
      hostState.current.S = baseS({ phase: "over", nightNumber: 1 });
      render(<App />);
      await userEvent.click(screen.getByTitle(/reveal every role/i));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(fetchMock.calls.some(c => c.url.includes("/api/table/reveal"))).toBe(false);

      await userEvent.click(screen.getByTitle(/reveal every role/i));
      await userEvent.click(screen.getByRole("button", { name: "Reveal", exact: true }));
      await vi.waitFor(() =>
        expect(fetchMock.calls.some(c => c.url.includes("/api/table/reveal"))).toBe(true),
      );
    });

    it("New game confirms, and only posts /api/table/reset + reloads on accept", async () => {
      const fetchMock = mockFetch({
        "/api/tokens": {},
        "/trivia.json": [],
        "/api/scripts": SCRIPTS,
        "/api/table/reset": {},
      });
      const reloadSpy = vi.fn();
      const originalLocation = window.location;
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...originalLocation, reload: reloadSpy },
      });
      hostState.current.S = baseS({ phase: "over", nightNumber: 1 });
      render(<App />);
      await userEvent.click(screen.getByTitle(/start a new game/i));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(fetchMock.calls.some(c => c.url.includes("/api/table/reset"))).toBe(false);
      expect(reloadSpy).not.toHaveBeenCalled();

      await userEvent.click(screen.getByTitle(/start a new game/i));
      await userEvent.click(screen.getByRole("button", { name: "Start over" }));
      await vi.waitFor(() =>
        expect(fetchMock.calls.some(c => c.url.includes("/api/table/reset"))).toBe(true),
      );
      await vi.waitFor(() => expect(reloadSpy).toHaveBeenCalled());
      Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    });
  });

  describe("the header's icon buttons are split into labeled groups, not one bare strip", () => {
    beforeEach(() => {
      hostState.current.S = baseS();
    });

    it("shows Display always, and Lobby/Reference only in the idle lobby", () => {
      render(<App />);
      expect(screen.getByText("Display")).toBeInTheDocument();
      expect(screen.getByText("Reference")).toBeInTheDocument();
      expect(screen.getByText("Lobby")).toBeInTheDocument();
      expect(screen.queryByText("Storyteller")).not.toBeInTheDocument();
    });

    it("shows Storyteller (Reveal/New game's group) during an in-progress game, not Reference/Lobby", () => {
      hostState.current.S = baseS({ phase: "night", nightNumber: 1 });
      render(<App />);
      expect(screen.getByText("Display")).toBeInTheDocument();
      expect(screen.getByText("Storyteller")).toBeInTheDocument();
      expect(screen.queryByText("Reference")).not.toBeInTheDocument();
      expect(screen.queryByText("Lobby")).not.toBeInTheDocument();
    });

    it("shows Script while browsing scripts", async () => {
      render(<App />);
      await userEvent.click(screen.getByText(/change script/i));
      expect(screen.getByText("Script")).toBeInTheDocument();
      expect(screen.queryByText("Lobby")).not.toBeInTheDocument();
    });
  });

  describe("the Game/Toolkit header switch", () => {
    it("is absent before any state has loaded — the toolkit only appears once the header's real controls do", () => {
      render(<App />);
      expect(screen.queryByRole("button", { name: "Toolkit" })).not.toBeInTheDocument();
    });

    it("switching to Toolkit hides the BOTC stage and lobby header actions, without touching the underlying phase", async () => {
      const players = Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`, name: `P${i}`, alive: true, connected: true, color: null,
      }));
      hostState.current.S = baseS({ players });
      render(<App />);
      expect(screen.getByTitle("Start Game")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Toolkit" }));
      expect(screen.getByRole("button", { name: "Toolkit" })).toHaveClass("active");
      expect(screen.queryByText("The town is still empty.")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Start Game")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /start/i })).toBeInTheDocument(); // TimerTool's own Start button
      expect(screen.getByText("lobby")).toBeInTheDocument(); // phase pill still reflects the real game underneath
    });

    it("switching back to Game restores the lobby view exactly as it was", async () => {
      hostState.current.S = baseS();
      render(<App />);
      await userEvent.click(screen.getByRole("button", { name: "Toolkit" }));
      await userEvent.click(screen.getByRole("button", { name: "Game" }));
      expect(screen.getByRole("button", { name: "Game" })).toHaveClass("active");
      expect(screen.getByText("The town is still empty.")).toBeInTheDocument();
    });
  });
});
