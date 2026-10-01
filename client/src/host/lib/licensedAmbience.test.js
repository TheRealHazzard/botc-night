import { describe, it, expect, beforeEach, vi } from 'vitest';

// jsdom's own HTMLMediaElement.play()/pause() throw "Not implemented" —
// a minimal fake stands in for the one real <audio> element this module
// creates (getAudio()'s module-level singleton), tracking just enough
// (play/pause call counts, the last assigned src, and a real numeric
// .volume so fadeTo's own ramping is actually observable) to test this
// module's own logic, not a real browser's media pipeline.
let instances;
class FakeAudio {
  constructor() {
    this.src = '';
    this.loop = false;
    this.preload = '';
    this.volume = 1;
    this.muted = false;
    this.playCalls = 0;
    this.pauseCalls = 0;
    instances.push(this);
  }
  play() { this.playCalls++; return Promise.resolve(); }
  pause() { this.pauseCalls++; }
}

describe('licensedAmbience', () => {
  beforeEach(async () => {
    instances = [];
    vi.stubGlobal('Audio', FakeAudio);
    vi.useFakeTimers();
    // Each test needs the module's own module-level `audio`/`currentKind`
    // state reset — re-importing fresh via vi.resetModules() is simpler
    // and more honest than exporting a test-only reset hook into the real
    // module just for this.
    vi.resetModules();
  });

  async function freshModule() {
    return await import('./licensedAmbience.js');
  }

  it('startLicensedAmbience creates one <audio> element, sets the right track, and starts silent before fading in', async () => {
    const { startLicensedAmbience } = await freshModule();
    startLicensedAmbience('night', false);
    expect(instances.length).toBe(1);
    expect(instances[0].src).toBe('/audio/ambient/night-stay-the-course.mp3');
    expect(instances[0].loop).toBe(true);
    expect(instances[0].playCalls).toBe(1);
    expect(instances[0].volume).toBe(0); // fade hasn't ticked yet
  });

  it('fades volume up to the track\'s own target level over time, not an instant jump', async () => {
    const { startLicensedAmbience } = await freshModule();
    startLicensedAmbience('night', false);
    const el = instances[0];
    await vi.advanceTimersByTimeAsync(1250); // halfway through the 2500ms fade
    expect(el.volume).toBeGreaterThan(0);
    expect(el.volume).toBeLessThan(0.35);
    await vi.advanceTimersByTimeAsync(1300); // past the end
    expect(el.volume).toBeCloseTo(0.35, 5);
  });

  it('calling start again with the SAME kind does not restart or re-fade an already-playing track', async () => {
    const { startLicensedAmbience } = await freshModule();
    startLicensedAmbience('night', false);
    await vi.advanceTimersByTimeAsync(2600);
    const el = instances[0];
    const volBefore = el.volume;
    startLicensedAmbience('night', false);
    expect(instances.length).toBe(1); // no second element created
    expect(el.playCalls).toBe(1); // not called again
    expect(el.volume).toBe(volBefore); // not reset to 0 and re-faded
  });

  it('swapping kind mid-stream switches the track and restarts the fade', async () => {
    const { startLicensedAmbience } = await freshModule();
    startLicensedAmbience('night', false);
    await vi.advanceTimersByTimeAsync(2600);
    startLicensedAmbience('day', false);
    const el = instances[0];
    expect(el.src).toBe('/audio/ambient/day-envision.mp3');
    expect(el.volume).toBe(0);
    await vi.advanceTimersByTimeAsync(2600);
    expect(el.volume).toBeCloseTo(0.3, 5);
  });

  it('muted plays nothing — no element even has to exist yet', async () => {
    const { startLicensedAmbience } = await freshModule();
    startLicensedAmbience('night', true);
    expect(instances.length).toBe(0);
  });

  it('stopLicensedAmbience fades to silence, then pauses — never pauses abruptly at full volume', async () => {
    const { startLicensedAmbience, stopLicensedAmbience } = await freshModule();
    startLicensedAmbience('night', false);
    await vi.advanceTimersByTimeAsync(2600);
    const el = instances[0];
    stopLicensedAmbience();
    expect(el.pauseCalls).toBe(0); // not yet — still fading
    await vi.advanceTimersByTimeAsync(1300);
    expect(el.volume).toBe(0);
    expect(el.pauseCalls).toBe(1);
  });

  it('stopLicensedAmbience is safe to call with nothing ever started', async () => {
    const { stopLicensedAmbience } = await freshModule();
    expect(() => stopLicensedAmbience()).not.toThrow();
    expect(instances.length).toBe(0); // never lazily creates an element just to stop it
  });

  it("a muted startLicensedAmbience call while something is already playing stops it (same 'muted stops in-flight audio' contract soundEngine.js's own cues follow)", async () => {
    const { startLicensedAmbience } = await freshModule();
    startLicensedAmbience('night', false);
    await vi.advanceTimersByTimeAsync(2600);
    const el = instances[0];
    startLicensedAmbience('day', true);
    await vi.advanceTimersByTimeAsync(1300);
    expect(el.volume).toBe(0);
    expect(el.pauseCalls).toBe(1);
  });

  it('primeLicensedAudio silently unlocks the element (muted play, then pause) without making it audible', async () => {
    const { primeLicensedAudio } = await freshModule();
    primeLicensedAudio();
    await Promise.resolve(); // let the play() promise's .then() run
    const el = instances[0];
    expect(el.playCalls).toBe(1);
    expect(el.pauseCalls).toBe(1);
  });

  it("primeLicensedAudio restores the element's own prior mute state afterward, rather than leaving it force-muted", async () => {
    const { primeLicensedAudio, startLicensedAmbience } = await freshModule();
    startLicensedAmbience('night', false); // creates the element, unmuted
    const el = instances[0];
    primeLicensedAudio();
    await Promise.resolve();
    expect(el.muted).toBe(false);
  });
});
