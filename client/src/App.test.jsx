import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App.jsx";
import { mockFetch } from "../test/fetchMock.js";

const tableState = vi.hoisted(() => ({
  current: { P: null, token: null, setToken: vi.fn() },
}));
const wakeLockCalls = vi.hoisted(() => []);

vi.mock("./hooks/useTableState.js", () => ({
  useTableState: () => tableState.current,
}));
vi.mock("./hooks/useWakeLock.js", () => ({
  useWakeLock: active => wakeLockCalls.push(active),
}));

function baseP(overrides = {}) {
  return {
    phase: "day",
    nightNumber: 1,
    wave: 0,
    you: {
      name: "Bo",
      alive: true,
      ghostVoteUsed: false,
      character: null,
      color: null,
    },
    watching: false,
    prompt: null,
    result: null,
    moonchildChoice: null,
    klutzChoice: null,
    madClaim: null,
    slayerShot: null,
    gossipClaim: null,
    jugglerGuess: null,
    savantVisit: null,
    artistQuestion: null,
    voteRequest: null,
    llmEnabled: false,
    ...overrides,
  };
}

describe("App", () => {
  beforeEach(() => {
    tableState.current = { P: null, token: null, setToken: vi.fn(), forgetToken: vi.fn() };
    wakeLockCalls.length = 0;
    mockFetch({ "/api/sim/seats": [], "/api/profiles": [], "/api/tokens": {} });
  });

  it("renders the join flow when there is no player state yet", async () => {
    render(<App />);
    expect(await screen.findByText(/who.s playing/i)).toBeInTheDocument();
  });

  it("renders the player app once P exists, with the topbar (just the wordmark + Script) always present", () => {
    tableState.current = { P: baseP(), token: "tok", setToken: vi.fn(), forgetToken: vi.fn() };
    render(<App />);
    expect(screen.getByAltText("Blood On The Clocktower")).toBeInTheDocument();
    expect(screen.getByText(/daylight/i)).toBeInTheDocument();
  });

  it('Change (in the "Seated as" lobby card), once confirmed, forgets the token; declining the confirm leaves it alone', async () => {
    const userEvent = (await import("@testing-library/user-event")).default;
    const forgetToken = vi.fn();
    tableState.current = { P: baseP({ phase: "lobby" }), token: "tok", setToken: vi.fn(), forgetToken };
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<App />);

    await userEvent.click(screen.getByText("Change"));
    expect(forgetToken).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText("Change"));
    expect(forgetToken).toHaveBeenCalledTimes(1);

    confirmSpy.mockRestore();
  });

  it("wires useWakeLock to whether the phase is night", () => {
    tableState.current = {
      P: baseP({ phase: "night", prompt: null, you: baseP().you }),
      token: "tok",
      setToken: vi.fn(),
    };
    render(<App />);
    expect(wakeLockCalls.at(-1)).toBe(true);
  });

  it("vibrates once on transitioning into night, not on every render at the same phase key", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, vibrate });

    tableState.current = {
      P: baseP({ phase: "day" }),
      token: "tok",
      setToken: vi.fn(),
    };
    const { rerender } = render(<App />);
    expect(vibrate).not.toHaveBeenCalled();

    tableState.current = {
      P: baseP({ phase: "night", prompt: null, you: baseP().you }),
      token: "tok",
      setToken: vi.fn(),
    };
    rerender(<App />);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith([90, 60, 90]);

    // Same phase/night/wave key again (e.g. an unrelated SSE push) — no repeat buzz.
    tableState.current = {
      P: baseP({ phase: "night", prompt: null, you: baseP().you }),
      token: "tok",
      setToken: vi.fn(),
    };
    rerender(<App />);
    expect(vibrate).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("opens and closes the script overlay from the topbar button", async () => {
    const userEvent = (await import("@testing-library/user-event")).default;
    mockFetch({
      "/api/tokens": {},
      "/api/script": { edition: "tb", characters: [] },
    });
    tableState.current = { P: baseP(), token: "tok", setToken: vi.fn() };
    render(<App />);
    await userEvent.click(screen.getByText("The script"));
    expect(await screen.findByText("Trouble Brewing")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Close"));
    expect(screen.queryByText("Trouble Brewing")).not.toBeInTheDocument();
  });
});
