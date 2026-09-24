import { describe, it, expect, beforeEach } from 'vitest';
import { installFakeAudioContext, resetAudioCalls, toneCalls, noiseCalls, lifecycleCalls } from '../../../test/fakeAudioContext.js';
import {
  playNightFalls, playDayBreaks, playImpactSting, playVictory, playNotableChime,
  suspendAudioContext, startAmbience, stopAmbience, setTensionIntensity,
} from './soundEngine.js';

describe('soundEngine', () => {
  beforeEach(() => {
    installFakeAudioContext();
    resetAudioCalls();
  });

  it('playNightFalls: layered tones + a noise texture, all in a low dread register', () => {
    playNightFalls(false);
    expect(toneCalls.length).toBeGreaterThanOrEqual(2);
    expect(noiseCalls.length).toBeGreaterThanOrEqual(1);
    expect(toneCalls.every(c => c.freq < 150)).toBe(true);
  });

  it('playDayBreaks: warmer/higher register than night', () => {
    playDayBreaks(false);
    expect(toneCalls.length).toBeGreaterThanOrEqual(2);
    expect(toneCalls.every(c => c.freq > 150)).toBe(true);
  });

  it('playImpactSting: sub-bass thud + noise crack + rumble', () => {
    playImpactSting(false);
    expect(toneCalls.length).toBeGreaterThanOrEqual(1);
    expect(noiseCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('playVictory(good): a full triad, no dissonant growl underneath', () => {
    playVictory('good', false);
    expect(toneCalls.length).toBeGreaterThanOrEqual(4);
    expect(noiseCalls.length).toBe(0);
  });

  it("playVictory(evil): low dissonant cluster + a rumble the good ending doesn't have", () => {
    playVictory('evil', false);
    expect(toneCalls.length).toBeGreaterThanOrEqual(3);
    expect(noiseCalls.length).toBeGreaterThanOrEqual(1);
    expect(toneCalls.every(c => c.freq < 100)).toBe(true);
  });

  it('muted: nothing plays at all, for any cue', () => {
    playNightFalls(true);
    playVictory('evil', true);
    expect(toneCalls.length).toBe(0);
    expect(noiseCalls.length).toBe(0);
  });

  it('suspendAudioContext: silences whatever a prior cue already started', () => {
    playNightFalls(false); // ensures the context exists
    suspendAudioContext();
    expect(lifecycleCalls).toContain('suspend');
  });

  it('startAmbience: a continuous night bed is three low oscillators (two base + the silent-at-rest tension layer) + a looping noise texture', () => {
    startAmbience('night', false);
    expect(toneCalls.length).toBe(3);
    expect(noiseCalls.length).toBe(1);
    expect(toneCalls.every(c => c.freq < 100)).toBe(true);
    stopAmbience();
  });

  it('startAmbience: day bed sits in a higher register than night', () => {
    startAmbience('day', false);
    expect(toneCalls.every(c => c.freq > 100)).toBe(true);
    stopAmbience();
  });

  it('startAmbience: muted starts nothing', () => {
    startAmbience('night', true);
    expect(toneCalls.length).toBe(0);
    expect(noiseCalls.length).toBe(0);
  });

  it('startAmbience: swapping kind tears down the previous bed rather than layering both', () => {
    startAmbience('night', false);
    resetAudioCalls();
    startAmbience('day', false);
    // Only the new bed's own oscillators/noise fire on this call — the
    // night bed's nodes are torn down (faded out on a timer), not left
    // running alongside the day bed.
    expect(toneCalls.length).toBe(3);
    expect(noiseCalls.length).toBe(1);
    stopAmbience();
  });

  it('stopAmbience: safe to call with nothing currently running', () => {
    expect(() => stopAmbience()).not.toThrow();
  });

  it('playNotableChime: a brief two-note shimmer (each tone() call is two detuned oscillators), no noise texture', () => {
    playNotableChime(false);
    expect(toneCalls.length).toBe(4);
    expect(noiseCalls.length).toBe(0);
  });

  it('playNotableChime: muted plays nothing', () => {
    playNotableChime(true);
    expect(toneCalls.length).toBe(0);
  });

  it('setTensionIntensity: a no-op with no ambience currently running', () => {
    expect(() => setTensionIntensity(0.8)).not.toThrow();
    expect(toneCalls.length).toBe(0);
  });

  it('setTensionIntensity: ramps the existing bed\'s own tension layer, never starting a new sound source', () => {
    startAmbience('night', false);
    resetAudioCalls();
    expect(() => setTensionIntensity(0.8)).not.toThrow();
    expect(toneCalls.length).toBe(0);
    expect(noiseCalls.length).toBe(0);
    stopAmbience();
  });

  it('setTensionIntensity: clamps out-of-range input instead of throwing', () => {
    startAmbience('night', false);
    expect(() => setTensionIntensity(5)).not.toThrow();
    expect(() => setTensionIntensity(-1)).not.toThrow();
    stopAmbience();
  });
});
