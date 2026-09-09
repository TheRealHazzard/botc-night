// jsdom has no Web Audio API at all — without this, any sound-engine code
// throws the instant it touches `new AudioContext()`. Ported from the
// dom-shim's own fake Web Audio class family (test/dom-shim/host.js),
// shared here since more than one test file needs it (soundEngine.test.js,
// and later anything exercising phase-change sound cues end to end).
export const toneCalls = [];
export const noiseCalls = [];

export function resetAudioCalls() {
  toneCalls.length = 0;
  noiseCalls.length = 0;
}

class FakeAudioParam {
  constructor(v) { this.value = v; }
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
}
class FakeAudioNode { connect() {} }
class FakeOscillator extends FakeAudioNode {
  constructor() { super(); this.frequency = new FakeAudioParam(440); this.detune = new FakeAudioParam(0); this.type = 'sine'; }
  start() { toneCalls.push({ freq: this.frequency.value, type: this.type }); }
  stop() {}
}
class FakeGainNode extends FakeAudioNode {
  constructor() { super(); this.gain = new FakeAudioParam(1); }
}
class FakeBiquadFilter extends FakeAudioNode {
  constructor() { super(); this.frequency = new FakeAudioParam(350); this.Q = new FakeAudioParam(1); this.type = 'lowpass'; }
}
class FakeAudioBuffer {
  constructor(numChannels, length) {
    this.numberOfChannels = numChannels;
    this._data = Array.from({ length: numChannels }, () => new Float32Array(length));
  }
  getChannelData(ch) { return this._data[ch]; }
}
class FakeBufferSource extends FakeAudioNode {
  constructor() { super(); this.buffer = null; }
  start() { noiseCalls.push({ buffer: this.buffer }); }
  stop() {}
}
class FakeConvolver extends FakeAudioNode {
  constructor() { super(); this.buffer = null; }
}
class FakeCompressor extends FakeAudioNode {
  constructor() { super(); this.threshold = new FakeAudioParam(-24); this.ratio = new FakeAudioParam(12); }
}

export class FakeAudioContext {
  constructor() { this.currentTime = 0; this.sampleRate = 44100; this.destination = new FakeAudioNode(); }
  createOscillator() { return new FakeOscillator(); }
  createGain() { return new FakeGainNode(); }
  createBiquadFilter() { return new FakeBiquadFilter(); }
  createBuffer(numChannels, length) { return new FakeAudioBuffer(numChannels, length); }
  createBufferSource() { return new FakeBufferSource(); }
  createConvolver() { return new FakeConvolver(); }
  createDynamicsCompressor() { return new FakeCompressor(); }
  resume() { return Promise.resolve(); }
}

export function installFakeAudioContext() {
  globalThis.AudioContext = FakeAudioContext;
}
