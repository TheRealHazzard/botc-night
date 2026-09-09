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
    expect(screen.getByText("Blood On The Clocktower")).toBeInTheDocument();
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
  it('a full evil-win reveal: skull badge + "Evil wins" copy + oxblood CSS vars + the victory sound cue, all together', () => {
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

    expect(screen.getByText("Evil wins")).toBeInTheDocument();
    expect(
      screen.getByText("The town executed a Townsfolk."),
    ).toBeInTheDocument();
    expect(
      document.querySelector(".victory-banner svg.icon").innerHTML,
    ).toContain("M12 3a7 7 0"); // skull path

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

    it("a failed confirm alerts and stays in browsing mode", async () => {
      mockFetch({
        "/api/tokens": {},
        "/trivia.json": [],
        "/api/scripts": SCRIPTS,
        "/api/table/script": { error: "Game already started." },
      });
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      render(<App />);
      await userEvent.click(screen.getByText(/change script/i));
      await userEvent.click(screen.getByTitle(/choose trouble brewing/i));
      await vi.waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith("Game already started."),
      );
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

    it("Start Game enables at 5+ players and posts /api/table/deal", async () => {
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
      await vi.waitFor(() =>
        expect(
          fetchMock.calls.some(c => c.url.includes("/api/table/deal")),
        ).toBe(true),
      );
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
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      hostState.current.S = baseS({ players });
      render(<App />);
      await userEvent.click(screen.getByTitle(/clear the lobby/i));
      expect(
        fetchMock.calls.some(c => c.url.includes("/api/table/clear-lobby")),
      ).toBe(false);
      confirmSpy.mockReturnValue(true);
      await userEvent.click(screen.getByTitle(/clear the lobby/i));
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
});
