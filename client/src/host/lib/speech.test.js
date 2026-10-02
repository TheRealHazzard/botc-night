import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// jsdom has no Web Speech API at all — every test here installs its own
// minimal fake, capturing whatever utterance was constructed so a test can
// fire its onstart/onend/onerror itself, the same "the test drives the
// callback" shape fakeAudioContext.js uses for Web Audio elsewhere in this
// suite. Reset and re-required fresh each test (vi.resetModules()) since
// speech.js's `spoken` dedupe is module-level state that would otherwise
// leak between tests.
let lastUtterance = null;
let speakCalls = [];
let cancelCalls = 0;

function installFakeSpeechSynthesis() {
  lastUtterance = null;
  speakCalls = [];
  cancelCalls = 0;
  global.SpeechSynthesisUtterance = function (text) {
    this.text = text;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  };
  global.window.speechSynthesis = {
    speaking: false,
    speak: u => { lastUtterance = u; speakCalls.push(u); },
    cancel: () => { cancelCalls++; },
  };
}

describe('speech.js', () => {
  beforeEach(() => {
    vi.resetModules();
    installFakeSpeechSynthesis();
  });
  afterEach(() => {
    delete global.window.speechSynthesis;
    delete global.SpeechSynthesisUtterance;
  });

  it('speak() creates and plays a real utterance when unmuted', async () => {
    const { speak } = await import('./speech.js');
    speak('Close your eyes.', { muted: false });
    expect(speakCalls.length).toBe(1);
    expect(lastUtterance.text).toBe('Close your eyes.');
  });

  it('speak() never constructs an utterance at all when muted', async () => {
    const { speak } = await import('./speech.js');
    speak('Close your eyes.', { muted: true });
    expect(speakCalls.length).toBe(0);
  });

  it('speak() is a no-op for the exact same line spoken twice in a row', async () => {
    const { speak } = await import('./speech.js');
    speak('Close your eyes.', { muted: false });
    speak('Close your eyes.', { muted: false });
    expect(speakCalls.length).toBe(1);
  });

  it('a different line always speaks again, even right after the first', async () => {
    const { speak } = await import('./speech.js');
    speak('Close your eyes.', { muted: false });
    speak('Everyone wakes.', { muted: false });
    expect(speakCalls.length).toBe(2);
  });

  it('onSpeakingChange fires true when the utterance actually starts, false when it ends', async () => {
    const { speak, onSpeakingChange } = await import('./speech.js');
    const seen = [];
    onSpeakingChange(v => seen.push(v));

    speak('Close your eyes.', { muted: false });
    expect(seen).toEqual([]); // nothing yet — onstart hasn't fired

    lastUtterance.onstart();
    expect(seen).toEqual([true]);

    lastUtterance.onend();
    expect(seen).toEqual([true, false]);
  });

  it('onerror also reports speaking:false, same as onend', async () => {
    const { speak, onSpeakingChange } = await import('./speech.js');
    const seen = [];
    onSpeakingChange(v => seen.push(v));
    speak('Close your eyes.', { muted: false });
    lastUtterance.onstart();
    lastUtterance.onerror();
    expect(seen).toEqual([true, false]);
  });

  it('unsubscribing via the returned function stops further notifications', async () => {
    const { speak, onSpeakingChange } = await import('./speech.js');
    const seen = [];
    const unsubscribe = onSpeakingChange(v => seen.push(v));
    unsubscribe();
    speak('Close your eyes.', { muted: false });
    lastUtterance.onstart();
    expect(seen).toEqual([]);
  });

  it('stopSpeaking() cancels the browser\'s speech and unconditionally notifies false', async () => {
    const { speak, onSpeakingChange, stopSpeaking } = await import('./speech.js');
    const seen = [];
    onSpeakingChange(v => seen.push(v));
    speak('Close your eyes.', { muted: false });
    lastUtterance.onstart();
    expect(seen).toEqual([true]);

    stopSpeaking();
    // 2, not 1 — speak() above already called cancel() once itself
    // (interrupting whatever came before it), and stopSpeaking() is a
    // second, separate cancel on top of that.
    expect(cancelCalls).toBe(2);
    // Fires even though the real browser never called onend/onerror for
    // the cancelled utterance — the whole point of this function existing
    // separately from a bare cancel() call.
    expect(seen).toEqual([true, false]);
  });

  it('stopSpeaking() never throws when the Web Speech API is entirely unavailable', async () => {
    delete global.window.speechSynthesis;
    const { stopSpeaking } = await import('./speech.js');
    expect(() => stopSpeaking()).not.toThrow();
  });
});
