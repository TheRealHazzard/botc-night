import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { installFakeAudioContext, resetAudioCalls, toneCalls } from '../../../test/fakeAudioContext.js';
import { usePhaseFade } from './usePhaseFade.js';

const lobby = { phase: 'lobby', nightNumber: 0, wave: 0, deaths: [], victory: null };
const night = { phase: 'night', nightNumber: 1, wave: 1, deaths: [], victory: null };
const day = { phase: 'day', nightNumber: 1, wave: 0, deaths: [], victory: null };
const overSlayer = { phase: 'over', nightNumber: 1, wave: 0, deaths: [{ name: 'Fay', cause: 'slayer' }], victory: { winner: 'good', reason: 'x' } };
const overNoBlow = { phase: 'over', nightNumber: 1, wave: 0, deaths: [], victory: { winner: 'good', reason: "The Mastermind's day expired." } };

function stubReducedMotion(matches) {
  vi.stubGlobal('matchMedia', () => ({ matches, addEventListener: () => {}, removeEventListener: () => {} }));
}

describe('usePhaseFade', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('the very first data shows immediately, no fade', () => {
    stubReducedMotion(false);
    const { result } = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: lobby } });
    expect(result.current.displayS).toEqual(lobby);
    expect(result.current.fading).toBe(false);
  });

  it('a same-phase-key update applies immediately, no fade, no sound cue', () => {
    stubReducedMotion(false);
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: night } });
    resetAudioCalls(); // clear whatever the initial mount's own "changed" transition played
    const nightUpdated = { ...night, deaths: [{ name: 'X', cause: 'demon' }] }; // same phase:night:wave key
    rerender({ S: nightUpdated });
    expect(result.current.displayS).toEqual(nightUpdated);
    expect(result.current.fading).toBe(false);
    expect(toneCalls.length).toBe(0);
  });

  it('a real phase transition fades: sound fires immediately, displayS holds until the transition completes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubReducedMotion(false);
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: day } });
    resetAudioCalls();

    act(() => rerender({ S: night }));
    expect(toneCalls.length).toBeGreaterThan(0); // playNightFalls fired immediately
    expect(result.current.fading).toBe(true);
    expect(result.current.transClass).toBe('dusk');
    expect(result.current.displayS).toEqual(day); // still showing the OLD phase

    await act(async () => { await vi.advanceTimersByTimeAsync(960); });
    expect(result.current.fading).toBe(false);
    expect(result.current.displayS).toEqual(night);
  });

  // The old phase's content fades out smoothly (the case above), but a
  // freshly-mounted new phase has no prior frame to transition FROM — left
  // alone it would just snap to full opacity instantly. `entering` gives it
  // one to transition from instead, so narration fades in rather than
  // popping in against the ring's own gradual seat sweep.
  //
  // requestAnimationFrame is stubbed with a manually-driven queue rather
  // than waiting on real frames — jsdom's window is reused across every
  // test in this file, and an earlier test's vi.useFakeTimers() leaves
  // jsdom's *internal* rAF scheduling wired to a now-dead fake clock even
  // after vi.useRealTimers() restores window.requestAnimationFrame's own
  // reference (confirmed directly: it looks native, but its callback
  // never fires again for the rest of the file). Driving the queue by
  // hand sidesteps that entirely and gives precise control over each of
  // the two frames instead of a real, unverifiable wait.
  it('the new phase mounts flagged as "entering" for a couple of frames, then clears so it can transition in', async () => {
    vi.useRealTimers();
    const rafQueue = [];
    vi.stubGlobal('requestAnimationFrame', cb => { rafQueue.push(cb); return rafQueue.length; });
    stubReducedMotion(false);
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: day } });
    resetAudioCalls();

    act(() => rerender({ S: night }));
    expect(result.current.entering).toBe(false); // not yet — still mid-exit-fade

    await act(async () => { await new Promise(r => setTimeout(r, 970)); }); // past TRANS_MS.dusk
    expect(result.current.displayS).toEqual(night); // the new phase has mounted...
    expect(result.current.entering).toBe(true); // ...still flagged, so it has something to fade in FROM
    expect(result.current.transClass).toBe('dusk');
    expect(rafQueue.length).toBe(1); // only the outer rAF has been scheduled so far

    act(() => { rafQueue.shift()(); }); // first frame: schedules the inner rAF
    expect(result.current.entering).toBe(true); // still true — only one frame has actually painted
    expect(rafQueue.length).toBe(1);

    act(() => { rafQueue.shift()(); }); // second frame: clears it, letting the CSS transition pick up
    expect(result.current.entering).toBe(false);
  });

  it('a same-key push landing mid-fade does not leave the stage stuck invisible', async () => {
    // Regression: a real bug, reported from an actual game. A player's
    // action (or a reconnect, or anything else that pushes fresh S)
    // landing inside the ~1s dusk/dawn fade window used to leave `fading`
    // stuck true forever — the effect's own cleanup clears the pending
    // setFading(false) timer (React always runs it before this rerun), and
    // the same-key branch that runs instead only called setDisplayS, never
    // setFading(false). .view.fading is opacity:0 in the real CSS, so the
    // whole stage (everything except the header, which lives outside
    // .view) would just disappear with nothing left scheduled to bring it
    // back — exactly "blank, only the header visible" from a live report.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubReducedMotion(false);
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: day } });
    resetAudioCalls();

    act(() => rerender({ S: night })); // starts the dusk fade
    expect(result.current.fading).toBe(true);

    // A second push arrives well before the 950ms dusk timer would have
    // fired on its own — same phase:night:wave key, just fresher data.
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    const nightUpdated = { ...night, deaths: [{ name: 'X', cause: 'demon' }] };
    act(() => rerender({ S: nightUpdated }));

    expect(result.current.fading).toBe(false); // must not still be true
    expect(result.current.displayS).toEqual(nightUpdated);
  });

  it('a cold mount straight into an already-finished game with a fatal blow shows it immediately — no stuck-null blank screen', () => {
    // Regression: opening/reloading the host page after a game (or
    // simulation) already ended on an execution/slayer-shot finds
    // usePhaseFade with nothing ever previously rendered. The willFlash
    // branch used to skip setDisplayS(S) in that case exactly like the
    // warm fatal-blow path (holding the "previous" phase on screen for
    // the flash to cut away from) — but on a cold mount there IS no
    // previous phase on screen, hasRenderedRef never flips true, and no
    // later SSE push (same phase/night/wave forever, on a finished idle
    // game) ever arrives to unstick it. App.jsx's `if (!displayS) return
    // <Header/>` then renders a bare header forever — a permanently
    // blank main content area with no way back into a real lobby.
    // Matches useHostState's real shape: S starts null (before the first
    // fetch/SSE message resolves) and only becomes real data on a LATER
    // render of the same hook instance — useState(S)'s initializer only
    // ever sees that first null, so displayS starts null and stays null
    // unless setDisplayS is actually called once real data arrives.
    stubReducedMotion(false);
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: null } });
    rerender({ S: overSlayer });
    expect(result.current.displayS).toEqual(overSlayer);
    expect(result.current.fatalFlashing).toBe(false);
  });

  it('reduceMotion skips the fade — displayS updates immediately, sound cue still fires', () => {
    stubReducedMotion(true);
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: day } });
    resetAudioCalls();
    rerender({ S: night });
    expect(toneCalls.length).toBeGreaterThan(0);
    expect(result.current.fading).toBe(false);
    expect(result.current.displayS).toEqual(night);
  });

  it('a fatal-blow transition holds displayS at the old phase, plays no victory sound yet, until onFatalFlashDone', () => {
    stubReducedMotion(false);
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: day } });
    resetAudioCalls();

    rerender({ S: overSlayer });
    expect(result.current.fatalFlashing).toBe(true);
    expect(result.current.blow).toEqual({ icon: 'crosshair', text: 'Fay falls.' });
    expect(result.current.displayS).toEqual(day); // NOT the reveal yet
    expect(result.current.fading).toBe(false); // no normal fade running alongside it

    act(() => result.current.onFatalFlashDone());
    expect(result.current.fatalFlashing).toBe(false);
    expect(result.current.displayS).toEqual(overSlayer);
    expect(toneCalls.some(c => c.freq > 150)).toBe(true); // playVictory('good') triad, only now
  });

  it('ambience tension tracks how many players have died — a grimmer night bed once the body count climbs', () => {
    stubReducedMotion(false);
    installFakeAudioContext();
    const allAlive = { phase: 'night', nightNumber: 2, deaths: [], victory: null, players: [{ alive: true }, { alive: true }, { alive: true }, { alive: true }] };
    const halfDead = { phase: 'night', nightNumber: 2, deaths: [], victory: null, players: [{ alive: true }, { alive: true }, { alive: false }, { alive: false }] };

    // Two separate hook instances, each going straight from day into
    // night once, so playNightFalls' own one-shot chime (unaffected by
    // tension) contributes an identical, fixed number of tones either
    // way — only startAmbience's extra tritone voice should differ.
    const first = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: day } });
    resetAudioCalls();
    act(() => first.rerender({ S: allAlive }));
    const noTensionCount = toneCalls.length;

    resetAudioCalls();
    const second = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: day } });
    resetAudioCalls();
    act(() => second.rerender({ S: halfDead }));
    const withTensionCount = toneCalls.length;

    expect(withTensionCount).toBe(noTensionCount + 1);
  });

  it('an "over" transition with no pickable blow just fades normally and plays victory immediately', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubReducedMotion(false);
    installFakeAudioContext();
    const { result, rerender } = renderHook(({ S }) => usePhaseFade(S), { initialProps: { S: day } });
    resetAudioCalls();

    act(() => rerender({ S: overNoBlow }));
    expect(result.current.fatalFlashing).toBe(false);
    expect(toneCalls.length).toBeGreaterThan(0); // playVictory fired immediately, no flash to wait for
    expect(result.current.fading).toBe(true);
    expect(result.current.transClass).toBe('over');

    await act(async () => { await vi.advanceTimersByTimeAsync(570); });
    expect(result.current.displayS).toEqual(overNoBlow);
  });
});
