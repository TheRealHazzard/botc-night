'use strict';
// A minimal fake DOM, just enough surface area for host.html's render logic
// to actually execute under Node (no browser tool is available in this
// environment) — this can't check pixels, but it WILL crash loudly on any
// undefined-property access, missing method, or thrown exception the way a
// real browser's console would, across every phase the screen can be in.

const vm = require('vm');
const fs = require('fs');
const path = require('path');

class FakeNode {
  constructor(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this._className = ''; this._text = ''; this._html = '';
    this.children = []; this.parent = null; this.attrs = {};
    this.style = { setProperty: (k, v) => { this.style[k] = v; }, removeProperty: k => { delete this.style[k]; } };
    this.disabled = false; this.onclick = null; this._selectedIndex = 0;
  }
  get options() { return this.tagName === 'SELECT' ? this.children : undefined; }
  get selectedIndex() { return this._selectedIndex; }
  set selectedIndex(v) { this._selectedIndex = v; }
  get value() { if (this.tagName === 'SELECT') { const o = this.children[this._selectedIndex]; return o ? o.value : ''; } return this._value; }
  set value(v) { this._value = v; }
  get className() { return this._className; }
  set className(v) { this._className = v; }
  get classList() {
    const self = this;
    return {
      add(c) { self._className = (self._className + ' ' + c).trim(); },
      remove(c) { self._className = self._className.split(/\s+/).filter(x => x !== c).join(' '); },
      contains(c) { return self._className.split(/\s+/).includes(c); },
      toggle(c, on) {
        const has = this.contains(c);
        const want = on === undefined ? !has : on;
        if (want && !has) this.add(c);
        if (!want && has) this.remove(c);
      },
    };
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get firstElementChild() { return this.children[0] || null; }
  get childNodes() { return this.children; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  setAttributeNS(_ns, k, v) { this.attrs[k] = v; }
  append(...nodes) { for (const n of nodes) this.appendChild(n); }
  prepend(...nodes) { for (const n of nodes.reverse()) { n.parent = this; this.children.unshift(n); } }
  appendChild(n) { if (n == null) throw new Error('appendChild called with null/undefined'); n.parent = this; this.children.push(n); return n; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  addEventListener() {}
}

// Node has no Web Audio API at all — stub just enough of it that the sound
// cues run their real code path (and would throw on a genuine mistake)
// without needing an actual audio device.
const toneCalls = [];
const noiseCalls = [];
class FakeAudioParam { constructor(v) { this.value = v; } setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
class FakeAudioNode { connect() {} }
class FakeOscillator extends FakeAudioNode {
  constructor() { super(); this.frequency = new FakeAudioParam(440); this.detune = new FakeAudioParam(0); this.type = 'sine'; }
  start() { toneCalls.push({ freq: this.frequency.value, type: this.type }); }
  stop() {}
}
class FakeGainNode extends FakeAudioNode { constructor() { super(); this.gain = new FakeAudioParam(1); } }
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
class FakeConvolver extends FakeAudioNode { constructor() { super(); this.buffer = null; } }
class FakeCompressor extends FakeAudioNode {
  constructor() { super(); this.threshold = new FakeAudioParam(-24); this.ratio = new FakeAudioParam(12); }
}
class FakeAudioContext {
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

// Fullscreen and visibility are both real browser event/property pairs
// (requestFullscreen()/fullscreenElement, visibilitychange/visibilityState)
// host.html's Phase-1 code reads and reacts to — faked here just enough
// that a test can flip the state and confirm the listener actually runs.
function makeDocument() {
  const registry = {};
  const listeners = {};
  const doc = {
    createElement: t => new FakeNode(t), createElementNS: (_n, t) => new FakeNode(t),
    createTextNode: t => { const n = new FakeNode('#text'); n._text = String(t); return n; },
    getElementById: id => registry[id] || null, documentElement: new FakeNode('html'),
    body: new FakeNode('body'), _registry: registry,
    visibilityState: 'visible',
    fullscreenElement: null,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
    // Real listener count for a type — lets a test confirm a handler was
    // actually torn down (e.g. a scoped keydown listener removed when an
    // overlay closes) instead of just leaking forever.
    _listenerCount(type) { return (listeners[type] || []).length; },
    // `evt` defaults to {} rather than undefined so a handler reading
    // e.g. `e.key` doesn't have to guard against a bare call — every real
    // browser event dispatch hands the listener a real object too.
    _dispatch(type, evt) { (listeners[type] || []).forEach(fn => fn(evt || {})); },
    exitFullscreen() { doc.fullscreenElement = null; doc._dispatch('fullscreenchange'); return Promise.resolve(); },
  };
  doc.documentElement.requestFullscreen = () => {
    doc.fullscreenElement = doc.documentElement;
    doc._dispatch('fullscreenchange');
    return Promise.resolve();
  };
  return doc;
}

const document = makeDocument();
['phase', 'stage', 'controls', 'reclaimBanner', 'brandIcon'].forEach(id => { document._registry[id] = new FakeNode('div'); });
document._registry.muteBtn = new FakeNode('button');
document._registry.settingsBtn = new FakeNode('button');
document._registry.fullscreenBtn = new FakeNode('button');

// navigator.wakeLock.request() resolves to a releasable sentinel, the same
// shape the real Wake Lock API returns — tracked in wakeLockCalls so a test
// can confirm it was (re-)requested at the right moments.
const wakeLockCalls = [];
const navigator = {
  wakeLock: {
    request: type => {
      wakeLockCalls.push(type);
      return Promise.resolve({ released: false, release() { this.released = true; return Promise.resolve(); } });
    },
  },
};
const fetchCalls = [];
const postBodies = [];
// Tracked here, not read back out of the vm's own `S` (a top-level `let`
// inside vm-run code lives in that context's lexical environment, not as a
// property of the contextified object — `ctx.S` from out here would just be
// undefined) — settingsOverlay() expects /api/table/config to echo the full
// merged config, the same shape the real server returns.
let mockConfig = null;
const SCRIPTS_FIXTURE = [
  {
    id: 'tb', name: 'Trouble Brewing', description: 'x', difficulty: 1, playable: true, official: true, characterCount: 22, gamesPlayed: 0,
    // Deliberately scrambled team order, and a mix of an id with real
    // fixture "art" (imp — see the TOKENS mock below) and ones without, to
    // exercise both real-art and fallback token rendering, and the
    // Townsfolk/Outsider/Minion/Demon regrouping, in the same fixture.
    // Only 4 here (a real edition's full cast runs 22-25) — the grouping
    // and rendering logic doesn't care how many there are.
    characters: [
      { id: 'imp', name: 'Imp', team: 'demon' },
      { id: 'chef', name: 'Chef', team: 'townsfolk' },
      { id: 'baron', name: 'Baron', team: 'minion' },
      { id: 'butler', name: 'Butler', team: 'outsider' },
    ],
  },
  { id: 'bmr', name: 'Bad Moon Rising', description: 'x', difficulty: 2, playable: true, official: true, characterCount: 25, gamesPlayed: 0 },
  { id: 'sv', name: 'Sects & Violets', description: 'x', difficulty: 3, playable: true, official: true, characterCount: 25, gamesPlayed: 0 },
  { id: 'hide-and-seek', name: 'Hide & Seek', description: 'x', difficulty: 3, playable: true, characterCount: 25, gamesPlayed: 0 },
  { id: 'lunar-eclipse', name: 'Lunar Eclipse', description: 'x', difficulty: 4, playable: true, characterCount: 25, gamesPlayed: 0 },
];
const localStorageStore = {};
const ctx = {
  window: { AudioContext: FakeAudioContext }, document, console, navigator,
  location: { host: 'x:3000', protocol: 'http:', origin: 'http://x:3000', reload() {} },
  localStorage: {
    getItem: k => (k in localStorageStore ? localStorageStore[k] : null),
    setItem: (k, v) => { localStorageStore[k] = String(v); },
    removeItem: k => { delete localStorageStore[k]; },
  },
  matchMedia: () => ({ matches: false }), alert: () => {}, confirm: () => false,
  requestAnimationFrame: cb => setTimeout(cb, 0),
  AudioContext: FakeAudioContext,
  fetch: (url, opts) => {
    if (opts && opts.method === 'POST') {
      fetchCalls.push(url);
      const parsedBody = opts.body ? JSON.parse(opts.body) : null;
      postBodies.push({ url, body: parsedBody });
      if (url.includes('/api/table/config') && parsedBody && mockConfig) Object.assign(mockConfig, parsedBody.config || {});
    }
    return Promise.resolve({
      json: () => Promise.resolve(
        url.includes('/api/session/current')
          ? { gamesPlayed: 3, goodWins: 2, evilWins: 1, players: [{ profileId: 'a', name: 'Ada', gamesPlayed: 3, wins: 2 }, { profileId: 'b', name: 'Bo', gamesPlayed: 3, wins: 1 }] }
          : url.includes('/api/scripts') ? SCRIPTS_FIXTURE
          // Echoes the patch back the same shape the real /api/table/config
          // does — settingsOverlay() reads r.config back into S.config, so a
          // bare {} here would clobber it with undefined.
          : url.includes('/api/table/config') ? { ok: true, config: mockConfig }
          : {}
      ),
    });
  },
  EventSource: class { constructor() {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  Option: class { constructor(t, v) { this.text = t; this.value = v; } },
  // A real browser gets this from host.html's own <script src="/qrcode.js">
  // tag, which this shim doesn't fetch — loaded here the same way
  // test/qrcode.js does, straight off the real file, so QR rendering runs
  // through the actual encoder rather than a stand-in.
  QRCodeGen: require(path.join('..', '..', 'public', 'qrcode.js')).QRCodeGen,
};
ctx.globalThis = ctx;
vm.createContext(ctx);

const HOST_HTML = path.join(__dirname, '..', '..', 'public', 'host.html');
vm.runInContext(fs.readFileSync(HOST_HTML, 'utf8').match(/<script>([\s\S]*)<\/script>/)[1], ctx);

function dump(node, depth) {
  if (!node || !node.tagName) return;
  console.log(' '.repeat(depth * 2) + '<' + node.tagName.toLowerCase() + (node.className ? '.' + node.className.trim().replace(/ /g, '.') : '') + '>' + (node.tagName === '#text' ? '' : (node.textContent && !node.children.length ? ' "' + node.textContent + '"' : '')));
  for (const c of node.children || []) dump(c, depth + 1);
}

const SCRIPT_CHARS_FIXTURE = [
  { id: 'chef', name: 'Chef', team: 'townsfolk', ability: 'x' },
  { id: 'empath', name: 'Empath', team: 'townsfolk', ability: 'x' },
  { id: 'butler', name: 'Butler', team: 'outsider', ability: 'x' },
  { id: 'poisoner', name: 'Poisoner', team: 'minion', ability: 'x' },
  { id: 'imp', name: 'Imp', team: 'demon', ability: 'x' },
];

const nightState = {
  phase: 'night', nightNumber: 2, wave: 1, windowEndsAt: Date.now() + 15000, script: 'tb',
  config: { windowSeconds: 60, wave2Seconds: 20 }, revealed: false, victory: null, mastermindExtraDay: false,
  players: [
    { id: 'p1', name: 'Ada', alive: true, connected: true, submitted: true, color: { hex: '#c9a13b' } },
    { id: 'p2', name: 'Bo', alive: false, connected: true, submitted: false, color: { hex: '#3f6b57' } },
  ],
  deaths: [], nominations: [], hint: null, log: [], pendingReclaims: [],
};
const TRIVIA_FIXTURE = [
  { fact: 'General fact, always shown.', scripts: null },
  { fact: 'TB-only fact.', scripts: ['tb'] },
  { fact: 'BMR-only fact, should never show against a tb game.', scripts: ['bmr'] },
];

console.log('=== NIGHT ===');
vm.runInContext('SCRIPT_CHARS = ' + JSON.stringify(SCRIPT_CHARS_FIXTURE) + '; lastScriptFetched = "tb";', ctx);
vm.runInContext('TRIVIA = ' + JSON.stringify(TRIVIA_FIXTURE) + '; triviaFact = null;', ctx);
vm.runInContext('S = ' + JSON.stringify(nightState) + ';', ctx);
vm.runInContext('lastPhaseKey=""; renderNow();', ctx);
dump(ctx.document._registry.stage, 0);
console.log('controls:');
dump(ctx.document._registry.controls, 0);

const rosterCard1 = vm.runInContext('scriptRosterCard()', ctx);
vm.runInContext('renderNow();', ctx); // same phase, same SCRIPT_CHARS — a real player-answer-style push
const rosterCard2 = vm.runInContext('scriptRosterCard()', ctx);
console.log('roster card is the SAME cached node across an unrelated re-render (not rebuilt):', rosterCard1 === rosterCard2);
vm.runInContext("SCRIPT_CHARS = SCRIPT_CHARS.concat([{id:'monk',name:'Monk',team:'townsfolk',ability:'x'}]);", ctx);
const rosterCard3 = vm.runInContext('scriptRosterCard()', ctx);
console.log('...but rebuilds once SCRIPT_CHARS actually changes:', rosterCard3 !== rosterCard2);
console.log('brandIcon (should be the static brandmark, once):');
dump(ctx.document._registry.brandIcon, 0);
const brandChildCountNight = ctx.document._registry.brandIcon.children.length;
vm.runInContext('S.phase = "day";', ctx);
vm.runInContext('renderNow();', ctx);
console.log('brandIcon child count after switching to day (should be unchanged, still 1):', ctx.document._registry.brandIcon.children.length, '(was', brandChildCountNight, 'on night)');

const dayState = {
  phase: 'day', nightNumber: 2, wave: 0, windowEndsAt: null, script: 'tb',
  config: { voteWindowSeconds: 20 }, revealed: false, victory: null, mastermindExtraDay: false,
  players: [
    { id: 'p1', name: 'Ada', alive: true, connected: true, ghostVoteUsed: false, color: { hex: '#c9a13b' } },
    { id: 'p2', name: 'Bo', alive: false, connected: true, ghostVoteUsed: false, color: { hex: '#3f6b57' } },
  ],
  deaths: [{ night: 2, name: 'Bo', cause: 'demon' }],
  nominations: [{ id: 'n1', day: 2, nominatorId: 'p1', nominatorName: 'Ada', nomineeId: 'p2', nomineeName: 'Bo', closed: true, yesCount: 1, votes: [{ playerId: 'p1', vote: 'yes' }] }],
  // A non-null hint on purpose — confirms the removed block really is gone
  // and doesn't resurrect itself, not just that the "usually null" path works.
  hint: 'Two who sit shoulder to shoulder share a secret. Neither will say so.',
  log: [], pendingReclaims: [],
};
console.log('\n=== DAY ===');
vm.runInContext('S = ' + JSON.stringify(dayState) + ';', ctx);
vm.runInContext('lastPhaseKey=""; renderNow();', ctx);
dump(ctx.document._registry.stage, 0);
console.log('controls:');
dump(ctx.document._registry.controls, 0);

function findAll2(node, pred, out) {
  out = out || [];
  if (!node) return out;
  if (pred(node)) out.push(node);
  for (const c of node.children || []) findAll2(c, pred, out);
  return out;
}
const hintNodes = findAll2(ctx.document._registry.stage, n => n._className === 'hint');
console.log('\n.hint nodes present with S.hint set (should be 0, since the storyteller-hint block was removed):', hintNodes.length);

// The Mastermind warning shares the .hint CSS class but is a separate,
// rules-critical message — confirm it's untouched by the removal above.
const mastermindDayState = JSON.parse(JSON.stringify(dayState));
mastermindDayState.mastermindExtraDay = true;
vm.runInContext('S = ' + JSON.stringify(mastermindDayState) + ';', ctx);
vm.runInContext('lastPhaseKey=""; renderNow();', ctx);
const mastermindHint = findAll2(ctx.document._registry.stage, n => n._className === 'hint');
console.log('.hint node present with mastermindExtraDay:true (should be 1, untouched):', mastermindHint.length);

// LOBBY: "Clear the lobby" — disabled with nobody seated, enabled and wired
// to the right endpoint once someone is, and a decline on the confirm()
// dialog must never fire the request.
console.log('\n=== LOBBY ===');
const emptyLobbyState = {
  phase: 'lobby', nightNumber: 0, wave: 0, windowEndsAt: null, script: 'tb',
  config: {}, revealed: false, victory: null, mastermindExtraDay: false,
  players: [], deaths: [], nominations: [], hint: null, log: [], pendingReclaims: [],
};
vm.runInContext('S = ' + JSON.stringify(emptyLobbyState) + ';', ctx);
vm.runInContext('lastPhaseKey=""; renderNow();', ctx);
function findAllC(node, pred) { return findAll2(node, pred); }
const clearBtnEmpty = findAllC(ctx.document._registry.controls, n => n.tagName === 'BUTTON' && n.textContent === 'Clear the lobby')[0];
console.log('"Clear the lobby" present with nobody seated:', !!clearBtnEmpty, '| disabled:', clearBtnEmpty && clearBtnEmpty.disabled);

// JOIN_ADDR resolves synchronously at boot (location.host here isn't
// localhost, so it's taken straight from location.origin) — by the time
// this first lobby render runs, the QR should already be there.
const joinAddrSpan = findAllC(ctx.document._registry.stage, n => n._className === 'joinaddr')[0];
const joinQrBox = findAllC(ctx.document._registry.stage, n => n._className === 'joinqr')[0];
const joinQrSvg = joinQrBox && joinQrBox.children.find(c => c.tagName === 'SVG');
console.log('join address resolved (not "finding the address…"):', joinAddrSpan && joinAddrSpan.textContent);
console.log('QR code renders in the lobby once JOIN_ADDR resolves:', !!joinQrBox && !!joinQrSvg);

const fullLobbyState = {
  ...emptyLobbyState,
  players: [
    { id: 'p1', name: 'Rob', alive: true, connected: true, color: null },
    { id: 'p2', name: 'Rob', alive: true, connected: true, color: null },
  ],
};
vm.runInContext('S = ' + JSON.stringify(fullLobbyState) + ';', ctx);
vm.runInContext('lastPhaseKey=""; renderNow();', ctx);
const clearBtn = findAllC(ctx.document._registry.controls, n => n.tagName === 'BUTTON' && n.textContent === 'Clear the lobby')[0];
console.log('"Clear the lobby" present with 2 seated:', !!clearBtn, '| disabled:', clearBtn && clearBtn.disabled);

vm.runInContext('confirm = () => false;', ctx);
fetchCalls.length = 0;
clearBtn.onclick();
console.log('decline on confirm() -> no request sent:', fetchCalls.length === 0);

vm.runInContext('confirm = () => true;', ctx);
fetchCalls.length = 0;
clearBtn.onclick();
console.log('accept on confirm() -> posts to /api/table/clear-lobby:', fetchCalls.length === 1 && fetchCalls[0] === '/api/table/clear-lobby');
vm.runInContext('confirm = () => false;', ctx);

const overState = {
  phase: 'over', nightNumber: 3, wave: 0, windowEndsAt: null, script: 'tb',
  config: {}, revealed: true, victory: { winner: 'good', reason: 'The Demon fell.' }, mastermindExtraDay: false,
  players: [
    { id: 'p1', name: 'Ada', alive: true, connected: true, character: 'Soldier', characterId: 'soldier', team: 'townsfolk', color: { hex: '#5b3866' } },
    { id: 'p2', name: 'Bo', alive: false, connected: true, character: 'Imp', characterId: 'imp', team: 'demon', color: { hex: '#8e2226' } },
  ],
  deaths: [{ night: 2, name: 'Bo', cause: 'execution' }],
  nominations: [], hint: null,
  log: [{ night: 1, text: 'The Imp killed no one.' }, { night: 2, text: 'Bo was executed.' }],
  pendingReclaims: [],
  gameSummary: {
    nominations: 2, totalVotes: 5, voteAccuracy: 0.8,
    ghostVotesUsed: 1, ghostVotesEligible: 1,
    longestSurvivingEvil: { name: 'Bo', night: 2, survived: false },
  },
  actionLog: [
    { night: 1, phase: 'night', playerId: 'p1', playerName: 'Ada', characterId: 'soldier', characterName: 'Soldier', targets: ['Bo'] },
    { night: 2, phase: 'day', playerId: 'p1', playerName: 'Ada', characterId: 'soldier', characterName: 'Soldier', targets: ['Bo'] },
  ],
};
console.log('\n=== OVER (good wins) ===');
vm.runInContext('TOKENS = {soldier:"data:image/png;base64,AAA", imp:"data:image/png;base64,BBB"};', ctx);
vm.runInContext('S = ' + JSON.stringify(overState) + ';', ctx);
vm.runInContext('lastPhaseKey=""; renderNow();', ctx);

// The boot-time fetch('/api/scripts') chain (kicked off once, at initial
// script load) is still pending as a microtask at this point — it resolves
// at the natural drain between this module's synchronous top-level code
// and the first scheduled timer below, calling render() with whatever S
// still is right then. Reset to null so that stray call is the harmless
// no-op render() already guarantees for a null S, instead of landing on
// this section's real 'over'-phase state and firing fatal-blow detection
// a second, unintended time.
vm.runInContext('S = null;', ctx);

function findFirst(node, pred) {
  if (!node) return null;
  if (pred(node)) return node;
  for (const c of node.children || []) { const f = findFirst(c, pred); if (f) return f; }
  return null;
}

// The Tonight card's own /api/session/current fetch resolves on a
// microtask — give it a tick before dumping so it's had a chance to land.
setTimeout(() => {
  // Restore the state this whole section is about (nulled out above only to
  // protect against the OTHER pending boot-time microtask that lands in the
  // gap between this module's synchronous code and this very timer).
  vm.runInContext('S = ' + JSON.stringify(overState) + ';', ctx);
  dump(ctx.document._registry.stage, 0);
  console.log('controls (footer):');
  dump(ctx.document._registry.controls, 0);
  console.log('--primary on <html>:', ctx.document.documentElement.style['--primary']);
  console.log('--primary-hi on <html>:', ctx.document.documentElement.style['--primary-hi']);

  // Power log: button shows (actionLog is non-empty), clicking it opens the
  // overlay, and the table has the right shape (1 header + 2 player rows,
  // 1 + nightNumber*2 columns), with the two actionLog entries landing in
  // the correct night/day cells and everything else blank.
  // (Re-set TOKENS — the app's own boot-time fetch('/api/tokens') resolves
  // to the mock's default {} once the event loop reaches this setTimeout,
  // clobbering the value set earlier for the initial OVER dump above.)
  vm.runInContext('TOKENS = {soldier:"data:image/png;base64,AAA", imp:"data:image/png;base64,BBB"};', ctx);
  const powerLogBtns = findAll2(ctx.document._registry.stage, n => n.tagName === 'BUTTON' && n.textContent === 'Power log');
  console.log('\npower log button present (actionLog non-empty):', powerLogBtns.length === 1);
  powerLogBtns[0].onclick();
  const overlay = findFirst(ctx.document.body, n => n._className === 'powerlog-overlay');
  console.log('overlay opened on click:', !!overlay);
  const rows = overlay.children[1].children[0].children; // body > table > trs
  console.log('table row count (1 header + 2 players):', rows.length);
  console.log('header column count (role + night1/day1 + night2/day2 + night3/day3):', rows[0].children.length);
  const adaRow = rows[1];
  const adaRoleCell = adaRow.children[0].children[0]; // td > .powerlog-role-cell
  console.log('Ada role cell has a token image:', adaRoleCell.children[0].tagName === 'IMG' && adaRoleCell.children[0]._className === 'powerlog-token');
  const adaText = adaRoleCell.children[1];
  console.log('Ada label:', adaText.children[0].textContent, '/', adaText.children[1].textContent);
  const night1Target = findFirst(adaRow.children[1], n => n._className === 'powerlog-target');
  console.log('Ada night1 cell has a target token + name (should be Bo):',
    night1Target && night1Target.children[0].tagName === 'IMG' && night1Target.children[0]._className === 'powerlog-target-token',
    night1Target && night1Target.children[1].textContent);
  console.log('Ada day1 cell (should be dash, entry was day 2):', adaRow.children[2].textContent, adaRow.children[2].className);
  const day2Target = findFirst(adaRow.children[4], n => n._className === 'powerlog-target');
  console.log('Ada day2 cell has a target token (should be Bo):', !!day2Target);
  const closeBtns = findAll2(overlay, n => n.tagName === 'BUTTON' && n.textContent === 'Close');
  closeBtns[0].onclick();
  console.log('overlay removed after Close:', !findFirst(ctx.document.body, n => n._className === 'powerlog-overlay'));

  // Targeted check: does a living, connected player's ring seat actually pick
  // up their assigned color, now that sim bots get one automatically?
  vm.runInContext('S = ' + JSON.stringify(nightState) + ';', ctx);
  vm.runInContext('lastPhaseKey=""; renderNow();', ctx);
  const adaAvatar = findFirst(ctx.document._registry.stage, n => n._className && n._className.includes('rseat-avatar') && !n._className.includes('dead'));
  console.log('\nAda (alive, color #c9a13b) avatar border/background:', adaAvatar.style.borderColor, adaAvatar.style.background);

  // Trivia: shows during night, filtered to the current script.
  const nightTrivia = findFirst(ctx.document._registry.stage, n => n._className === 'trivia');
  console.log('night trivia box text:', nightTrivia && nightTrivia.children[1] && nightTrivia.children[1].textContent);

  // Trivia: day phase with a CLOSED nomination (the earlier dayState fixture)
  // should NOT show trivia — nothing to wait on.
  vm.runInContext('S = ' + JSON.stringify(dayState) + ';', ctx);
  vm.runInContext('lastPhaseKey=""; renderNow();', ctx);
  const closedDayTrivia = findFirst(ctx.document._registry.stage, n => n._className === 'trivia');
  console.log('day (closed nomination) trivia present (should be false):', !!closedDayTrivia);

  // Trivia: day phase with an OPEN nomination should show it.
  const openVoteDayState = JSON.parse(JSON.stringify(dayState));
  openVoteDayState.nominations = [{ id: 'n2', day: 2, nominatorId: 'p1', nominatorName: 'Ada', nomineeId: 'p2', nomineeName: 'Bo', closed: false, yesCount: 0, votes: [], windowEndsAt: Date.now() + 10000 }];
  vm.runInContext('S = ' + JSON.stringify(openVoteDayState) + ';', ctx);
  vm.runInContext('lastPhaseKey=""; renderNow();', ctx);
  const openDayTrivia = findFirst(ctx.document._registry.stage, n => n._className === 'trivia');
  console.log('day (open nomination) trivia present (should be true):', !!openDayTrivia);

  console.log('\n=== VOTE TALLY BAR ===');
  const voteBarState = JSON.parse(JSON.stringify(dayState));
  voteBarState.players = [
    { id: 'p1', name: 'Ada', alive: true, connected: true, ghostVoteUsed: false, color: { hex: '#c9a13b' } },
    { id: 'p2', name: 'Bo', alive: true, connected: true, ghostVoteUsed: false, color: { hex: '#3f6b57' } },
    { id: 'p3', name: 'Cy', alive: true, connected: true, ghostVoteUsed: false, color: { hex: '#5b3866' } },
    { id: 'p4', name: 'Di', alive: true, connected: true, ghostVoteUsed: false, color: { hex: '#8e2226' } },
    { id: 'p5', name: 'Ev', alive: false, connected: true, ghostVoteUsed: true, color: { hex: '#333333' } },
  ];
  voteBarState.nominations = [{
    id: 'n3', day: 2, nominatorId: 'p1', nominatorName: 'Ada', nomineeId: 'p2', nomineeName: 'Bo',
    closed: false, yesCount: 0, windowEndsAt: Date.now() + 10000,
    votes: [{ playerId: 'p1', vote: 'yes' }, { playerId: 'p3', vote: 'yes' }, { playerId: 'p4', vote: 'no' }],
  }];
  vm.runInContext('S = ' + JSON.stringify(voteBarState) + ';', ctx);
  vm.runInContext('lastPhaseKey=""; renderNow();', ctx);
  const fillBelow = findFirst(ctx.document._registry.stage, n => n._className && n._className.includes('votebar-fill'));
  const labelBelow = findFirst(ctx.document._registry.stage, n => n._className === 'votebar-label');
  console.log('  ok    4 living players -> majority threshold is 3:', labelBelow && labelBelow.textContent === '2 / 3 needed to execute');
  console.log('  ok    below threshold -> fill not yet "met":', fillBelow && !fillBelow._className.includes('met'));
  console.log('  ok    fill width reflects 2/3 (~67%):', fillBelow && Math.round(parseFloat(fillBelow.style.width)) === 67);

  voteBarState.nominations[0].votes.push({ playerId: 'p2', vote: 'yes' }); // 3rd yes -> meets threshold
  vm.runInContext('S = ' + JSON.stringify(voteBarState) + ';', ctx);
  vm.runInContext('lastPhaseKey=""; renderNow();', ctx);
  const fillAt = findFirst(ctx.document._registry.stage, n => n._className && n._className.includes('votebar-fill'));
  const labelAt = findFirst(ctx.document._registry.stage, n => n._className === 'votebar-label');
  console.log('  ok    at threshold -> label reads 3 / 3:', labelAt && labelAt.textContent === '3 / 3 needed to execute');
  console.log('  ok    at threshold -> fill tips to "met":', fillAt && fillAt._className.includes('met'));
  console.log('  ok    fill width caps at 100%:', fillAt && parseFloat(fillAt.style.width) === 100);

  console.log('\n=== SOUND ENGINE ===');
  vm.runInContext('soundMuted = false;', ctx);

  toneCalls.length = 0; noiseCalls.length = 0;
  vm.runInContext('playNightFalls();', ctx);
  console.log('  ok    playNightFalls: layered tones + a noise texture, none muted-away:', toneCalls.length >= 2 && noiseCalls.length >= 1, `(tones=${toneCalls.length}, noise=${noiseCalls.length})`);
  console.log('  ok    playNightFalls: low register (dread, not a chime):', toneCalls.every(c => c.freq < 150));

  toneCalls.length = 0; noiseCalls.length = 0;
  vm.runInContext('playDayBreaks();', ctx);
  console.log('  ok    playDayBreaks: warmer/higher register than night:', toneCalls.length >= 2 && toneCalls.every(c => c.freq > 150));

  toneCalls.length = 0; noiseCalls.length = 0;
  vm.runInContext('playImpactSting();', ctx);
  console.log('  ok    playImpactSting: sub-bass thud + noise crack + rumble:', toneCalls.length >= 1 && noiseCalls.length >= 2);

  toneCalls.length = 0; noiseCalls.length = 0;
  vm.runInContext("playVictory('good');", ctx);
  const goodCount = toneCalls.length;
  console.log('  ok    playVictory(good): a full triad, no dissonant growl underneath:', goodCount >= 4 && noiseCalls.length === 0);

  toneCalls.length = 0; noiseCalls.length = 0;
  vm.runInContext("playVictory('evil');", ctx);
  console.log('  ok    playVictory(evil): low dissonant cluster + a rumble the good ending doesn\'t have:', toneCalls.length >= 3 && noiseCalls.length >= 1 && toneCalls.every(c => c.freq < 100));

  toneCalls.length = 0; noiseCalls.length = 0;
  vm.runInContext('soundMuted = true; playNightFalls(); playVictory("evil");', ctx);
  console.log('  ok    muted: nothing plays at all:', toneCalls.length === 0 && noiseCalls.length === 0);
  vm.runInContext('soundMuted = false;', ctx);

  testSettingsOverlay();
  testTvModePhase1();
  testScriptPicker();
  testFatalBlowSelection();
  testFatalBlow();
}, 20);

// The new table-settings panel (Part A/B/C of the tuning work): opens over
// the lobby, reflects the current config, and posts a patch per control —
// this only checks the client wiring; applyConfigPatch's own clamping is
// covered at the engine level in tools/simulate.js.
function testSettingsOverlay() {
  console.log('\n=== SETTINGS ===');
  const settingsState = {
    phase: 'lobby', nightNumber: 0, wave: 0, windowEndsAt: null, script: 'sv',
    config: {
      windowSeconds: 60, wave2Seconds: 20, hintNights: [1, 2], dramaBias: 0.5,
      recluseRegistersEvil: 0.5, mayorRedirectChance: 0.5, shabalothRegurgitateChance: 0.5,
      pacifistSaveChance: 0.5, tinkerDeathChance: 0.1, madExecutionChance: 0.3, voteWindowSeconds: 20,
      disabledCharacterIds: [], llmStorytellerEnabled: false,
    },
    llmConfigured: false, revealed: false, victory: null, mastermindExtraDay: false,
    players: [], deaths: [], nominations: [], hint: null, log: [], pendingReclaims: [],
  };
  mockConfig = JSON.parse(JSON.stringify(settingsState.config));
  vm.runInContext('S = ' + JSON.stringify(settingsState) + ';', ctx);
  vm.runInContext('renderNow();', ctx);

  vm.runInContext('settingsOverlay();', ctx);
  const overlay = findFirst(ctx.document.body, n => n._className === 'settings-overlay');
  console.log('  ok    settingsBtn opens the settings overlay:', !!overlay);

  const rangeInputs = findAll2(overlay, n => n.tagName === 'INPUT' && n.type === 'range');
  console.log('  ok    one range slider per Storyteller-whim + drama-bias field (7):', rangeInputs.length === 7);

  const numberInputs = findAll2(overlay, n => n.tagName === 'INPUT' && n.type === 'number');
  console.log('  ok    one number field per timing setting (3):', numberInputs.length === 3);

  const checkboxes = findAll2(overlay, n => n.tagName === 'INPUT' && n.type === 'checkbox');
  console.log('  ok    3 hint-night boxes + Bucket 4 toggle + LLM toggle (5 checkboxes):', checkboxes.length === 5);

  postBodies.length = 0;
  const mayorSlider = rangeInputs.find(i => i.value === 0.5); // several share this default; just exercise one — note: this fake DOM stores .value as whatever type was assigned (a real browser always stringifies), so 0.5 (a number), not '0.5'
  mayorSlider.value = '0.8';
  mayorSlider.onchange();
  const chanceCall = postBodies.find(c => c.url === '/api/table/config');
  console.log('  ok    dragging a whim slider posts a numeric patch to /api/table/config:',
    !!chanceCall && typeof Object.values(chanceCall.body.config)[0] === 'number');

  postBodies.length = 0;
  const bucket4Checkbox = checkboxes.find(cb => !cb.checked && cb !== checkboxes[0] && cb !== checkboxes[1] && cb !== checkboxes[2]);
  bucket4Checkbox.checked = true;
  bucket4Checkbox.onchange();
  const bucket4Call = postBodies.find(c => c.url === '/api/table/config' && 'disabledCharacterIds' in c.body.config);
  console.log('  ok    the Bucket 4 toggle posts all three ids:',
    !!bucket4Call && JSON.stringify(bucket4Call.body.config.disabledCharacterIds.slice().sort()) === JSON.stringify(['artist', 'gossip', 'savant']));

  postBodies.length = 0;
  const llmCheckbox = checkboxes[checkboxes.length - 1];
  llmCheckbox.checked = true;
  llmCheckbox.onchange();
  const llmCall = postBodies.find(c => c.url === '/api/table/config' && 'llmStorytellerEnabled' in c.body.config);
  console.log('  ok    the LLM toggle posts llmStorytellerEnabled:true:', !!llmCall && llmCall.body.config.llmStorytellerEnabled === true);

  const status = findFirst(overlay, n => n._className && n._className.includes('llm-status'));
  console.log('  ok    the LLM status line reflects "not configured" when llmConfigured is false:', status && status.textContent.includes('Not configured'));

  const closeBtn = findFirst(overlay, n => n.tagName === 'BUTTON' && n.textContent === 'Close');
  closeBtn.onclick();
  console.log('  ok    Close removes the overlay:', !findFirst(ctx.document.body, n => n._className === 'settings-overlay'));

  // Mid-game: the Bucket 4 toggle must be disabled (lobby-only), matching
  // script selection's own gate.
  vm.runInContext('S.phase = "night";', ctx);
  vm.runInContext('settingsOverlay();', ctx);
  const nightOverlay = findFirst(ctx.document.body, n => n._className === 'settings-overlay');
  const nightCheckboxes = findAll2(nightOverlay, n => n.tagName === 'INPUT' && n.type === 'checkbox');
  const nightBucket4 = nightCheckboxes.find(cb => cb !== nightCheckboxes[0] && cb !== nightCheckboxes[1] && cb !== nightCheckboxes[2] && cb !== nightCheckboxes[nightCheckboxes.length - 1]);
  console.log('  ok    the Bucket 4 toggle is disabled once roles are dealt:', !!nightBucket4 && nightBucket4.disabled === true);
  vm.runInContext('S.phase = "lobby";', ctx);
}

// The three practical-reliability features from TV-mode Phase 1: the wake
// lock lifecycle and the fullscreen toggle, exercised end to end against
// the fake navigator.wakeLock / document.fullscreenElement stubs above (the
// join-QR itself is already covered in the LOBBY section, since it's part
// of ordinary lobby rendering rather than its own lifecycle).
function testTvModePhase1() {
  console.log('\n=== WAKE LOCK ===');
  console.log('  ok    requested once on load:', wakeLockCalls.length === 1 && wakeLockCalls[0] === 'screen');
  wakeLockCalls.length = 0;
  ctx.document.visibilityState = 'hidden';
  ctx.document._dispatch('visibilitychange');
  console.log('  ok    no re-request while merely going hidden:', wakeLockCalls.length === 0);
  ctx.document.visibilityState = 'visible';
  ctx.document._dispatch('visibilitychange');
  console.log('  ok    re-requested on becoming visible again:', wakeLockCalls.length === 1 && wakeLockCalls[0] === 'screen');

  console.log('\n=== FULLSCREEN TOGGLE ===');
  const fsBtn = ctx.document._registry.fullscreenBtn;
  console.log('  ok    button is shown (feature-detected as supported):', fsBtn.hidden === false);
  console.log('  ok    button carries an icon:', fsBtn.children.length > 0);
  fsBtn.onclick();
  console.log('  ok    click enters fullscreen:', ctx.document.fullscreenElement === ctx.document.documentElement);
  console.log('  ok    title switches to the exit phrasing:', fsBtn.title === 'Exit fullscreen');
  fsBtn.onclick();
  console.log('  ok    click again exits fullscreen:', ctx.document.fullscreenElement === null);
  console.log('  ok    title reverts to the enter phrasing:', fsBtn.title === 'Enter fullscreen');
}

// The picker used to be a flat grid, then two grouped sections — both fell
// apart once there could be any number of scripts. Now the lobby shows only
// the active script (scriptHero) with a "Change script" button opening a
// carousel (scriptPickerOverlay): one focal script at a time, dimmed peeks
// either side, steppable by chevron, peek-click, dot-click, or arrow keys,
// wrapping at both ends. matchMedia is temporarily forced to report
// prefers-reduced-motion so every step/close happens synchronously —
// otherwise this would need real 140ms/200ms waits, the same reason
// testFatalBlow() at the bottom of this file needs a real setTimeout of
// its own; that one still exercises the animated path deliberately, this
// one doesn't need to.
function testScriptPicker() {
  console.log('\n=== SCRIPT PICKER ===');
  vm.runInContext('matchMedia = () => ({ matches: true });', ctx);
  vm.runInContext('S = ' + JSON.stringify(emptyLobbyState) + ';', ctx);
  vm.runInContext('lastPhaseKey=""; renderNow();', ctx);

  const hero = findFirst(ctx.document._registry.stage, n => n._className === 'script-hero');
  console.log('  ok    lobby shows a single hero card for the active script:', !!hero);
  const heroCards = hero ? findAll2(hero, n => n._className && n._className.includes('script-card')) : [];
  console.log('  ok    exactly one card inside it:', heroCards.length === 1);
  console.log('  ok    the lobby hero stays compact — no cast grid on it:', !findFirst(hero, n => n._className === 'cast-grid-wrap'));
  const changeBtn = hero && findFirst(hero, n => n.tagName === 'BUTTON');
  console.log('  ok    a "Change script" button is present:', !!changeBtn);

  changeBtn.onclick();
  const overlay = findFirst(ctx.document.body, n => n._className && n._className.includes('script-picker-overlay'));
  console.log('  ok    clicking it opens the picker overlay:', !!overlay);

  // .includes('script-list-row') would also match the row's own
  // '.script-list-row-name'/'.script-list-row-active-dot' children if they
  // were ever checked with a plain substring — an exact class-token check
  // (same technique the old carousel's dot-vs-dots test used) avoids that.
  const isRow = n => n._className && n._className.split(' ').includes('script-list-row');
  const rows = () => findAll2(overlay, isRow);
  const detailPane = () => findFirst(overlay, n => n._className === 'script-detail');
  const detailName = () => {
    const h3 = findFirst(detailPane(), n => n.tagName === 'H3');
    return h3 && h3.textContent;
  };

  console.log('  ok    browsing starts on the currently active script:', detailName() === 'Trouble Brewing');
  console.log('  ok    one list row per script:', rows().length === SCRIPTS_FIXTURE.length);
  console.log("  ok    the active script's row is marked browsed at open:", rows()[0]._className.split(' ').includes('browsed'));
  console.log('  ok    that row also carries the "current script" marker:',
    !!findFirst(rows()[0], n => n._className === 'script-list-row-active-dot'));
  console.log('  ok    a different, non-browsed row carries no such marker:',
    !findFirst(rows()[1], n => n._className === 'script-list-row-active-dot'));

  // The cast grid — detail-pane only, real art where the fixture has it
  // (imp), a plain fallback circle where it doesn't (chef/butler/baron),
  // regrouped into Townsfolk/Outsider/Minion/Demon order regardless of the
  // scrambled order the fixture arrived in, and — the actual point of this
  // whole redesign — a visible name label under every token, real art
  // included, not just a hover title nobody on a TV will ever see.
  const castTokens = () => {
    const cg = findFirst(detailPane(), n => n._className === 'cast-grid-wrap');
    return cg ? findAll2(cg, n => n._className === 'cast-token') : [];
  };
  const tokenLabel = t => { const l = findFirst(t, n => n._className === 'cast-token-label'); return l && l.textContent; };
  const tokenArt = t => findFirst(t, n => n.tagName === 'IMG' || n._className === 'roster-token-fallback');

  const ct = castTokens();
  console.log('  ok    the detail pane shows one token per cast character:', ct.length === 4);
  console.log('  ok    regrouped into Townsfolk, Outsider, Minion, Demon order:',
    tokenLabel(ct[0]) === 'Chef' && tokenLabel(ct[1]) === 'Butler' && tokenLabel(ct[2]) === 'Baron' && tokenLabel(ct[3]) === 'Imp');
  console.log('  ok    every token carries a visible name label:', ct.every(t => !!tokenLabel(t)));
  console.log('  ok    a character with fixture "art" (imp) renders as a real image:', tokenArt(ct[3]).tagName === 'IMG');
  console.log('  ok    a character with none (chef) falls back to a plain circle:', tokenArt(ct[0]).tagName !== 'IMG');

  // Clicking a row jumps the detail pane straight to it.
  rows()[1].onclick(); // bmr
  console.log('  ok    clicking a row jumps straight to it:', detailName() === 'Bad Moon Rising');
  console.log('  ok    the clicked row becomes the browsed one, the old one no longer is:',
    rows()[1]._className.split(' ').includes('browsed') && !rows()[0]._className.split(' ').includes('browsed'));

  // Keyboard: real key dispatch, not a direct function call — proves onKey
  // is actually wired to document, not just present in source. Up/Down now
  // that this is a vertical list, not Left/Right.
  ctx.document._dispatch('keydown', { key: 'ArrowDown' });
  console.log('  ok    ArrowDown steps forward:', detailName() === 'Sects & Violets');
  // From index 2 (sv), three ArrowUps are needed to go below zero and
  // actually wrap (2 -> 1 -> 0 -> 4) — two would only reach index 0.
  ctx.document._dispatch('keydown', { key: 'ArrowUp' });
  ctx.document._dispatch('keydown', { key: 'ArrowUp' });
  ctx.document._dispatch('keydown', { key: 'ArrowUp' });
  console.log('  ok    stepping past the start wraps to the end:', detailName() === 'Lunar Eclipse');
  ctx.document._dispatch('keydown', { key: 'ArrowDown' });
  console.log('  ok    stepping past the end wraps back to the start:', detailName() === 'Trouble Brewing');

  const keydownCountOpen = ctx.document._listenerCount('keydown');
  console.log('  ok    a keydown listener is attached while open:', keydownCountOpen > 0);

  ctx.document._dispatch('keydown', { key: 'Escape' });
  const overlayAfterEscape = findFirst(ctx.document.body, n => n._className && n._className.includes('script-picker-overlay'));
  console.log('  ok    Escape closes the overlay without changing the active script:', !overlayAfterEscape);
  console.log('  ok    the keydown listener is removed on close (no leak):', ctx.document._listenerCount('keydown') === 0);
  console.log('  ok    S.script is untouched by browsing that was never confirmed:', vm.runInContext('S.script', ctx) === 'tb');

  // Reopening and confirming a different script should actually post it.
  changeBtn.onclick();
  const overlay2 = findFirst(ctx.document.body, n => n._className && n._className.includes('script-picker-overlay'));
  findAll2(overlay2, isRow)[1].onclick(); // -> bmr
  postBodies.length = 0;
  const confirmBtn = findFirst(overlay2, n => n.tagName === 'BUTTON' && n.textContent && n.textContent.startsWith('Choose '));
  confirmBtn.onclick();
  const scriptPost = postBodies.find(c => c.url === '/api/table/script');
  console.log('  ok    confirming posts the browsed script, not the original one:', !!scriptPost && scriptPost.body.script === 'bmr');
  // confirmChoice()'s own closeOverlay() only runs once the mocked fetch's
  // promise resolves — a microtask, not yet run at this point in a purely
  // synchronous test script — so overlay2 would otherwise still be sitting
  // in document.body when the next sub-test goes looking for "the" overlay.
  // Closing it here directly is test cleanup, not something the real app
  // needs to be told to do.
  overlay2.remove();

  // A locked script still gets a row (you should be able to see what's
  // coming) but shows "Coming soon" and never posts.
  const g2Scripts = SCRIPTS_FIXTURE.concat([{ id: 'locked-one', name: 'Locked One', description: 'x', difficulty: 1, playable: false, characterCount: 20, gamesPlayed: 0 }]);
  vm.runInContext('SCRIPTS = ' + JSON.stringify(g2Scripts) + ';', ctx);
  vm.runInContext('lastPhaseKey=""; renderNow();', ctx);
  const hero2 = findFirst(ctx.document._registry.stage, n => n._className === 'script-hero');
  findFirst(hero2, n => n.tagName === 'BUTTON').onclick();
  const overlay3 = findFirst(ctx.document.body, n => n._className && n._className.includes('script-picker-overlay'));
  const rows3 = findAll2(overlay3, isRow);
  console.log('  ok    the locked script still gets a row, tagged "Soon":',
    !!findFirst(rows3[rows3.length - 1], n => n._className === 'badge-soon'));
  rows3[rows3.length - 1].onclick(); // the locked one, last in the list
  const lockedConfirmBtn = findFirst(overlay3, n => n.tagName === 'BUTTON' && n.textContent === 'Coming soon');
  console.log('  ok    a locked script shows "Coming soon" instead of a working confirm button:', !!lockedConfirmBtn && lockedConfirmBtn.disabled === true);
  postBodies.length = 0;
  lockedConfirmBtn.onclick();
  console.log('  ok    clicking it does not post anything:', !postBodies.some(c => c.url === '/api/table/script'));
  findFirst(overlay3, n => n.tagName === 'BUTTON' && n.textContent === 'Close').onclick();

  vm.runInContext('matchMedia = () => ({ matches: false });', ctx);
}

// pickFatalBlow's category selection, checked as a pure function (no DOM,
// no timers) — separate from the overlay lifecycle itself (show, hold,
// hide, then the reveal underneath), which only needs proving once since
// every category shares the exact same playFatalBlow() plumbing.
function testFatalBlowSelection() {
  console.log('\n=== FATAL BLOW: WHICH ENDING WINS ===');
  const check = (label, state, expectIcon, expectTextIncludes) => {
    const blow = vm.runInContext('pickFatalBlow(' + JSON.stringify(state) + ')', ctx);
    const ok = !!blow && blow.icon === expectIcon && blow.text.includes(expectTextIncludes);
    console.log(`  ok    ${label}:`, ok, ok ? '' : ('— got ' + JSON.stringify(blow)));
  };
  check('the Slayer\'s shot beats every other category',
    { deaths: [{ name: 'Fay', cause: 'slayer' }], victory: { reason: 'The Demon is dead.' } }, 'crosshair', 'Fay falls');
  check('a plain execution that ends the game',
    { deaths: [{ name: 'Bo', cause: 'execution' }], victory: { reason: 'The Demon is dead.' } }, 'scroll', 'Bo is executed');
  check('a night kill that ends the game',
    { deaths: [{ name: 'Ada', cause: 'demon' }], victory: { reason: 'Only the Demon and one other remain.' } }, 'moon', 'night claims Ada');
  check('the Evil Twin\'s twin was executed — named as the twist it is, not a plain execution',
    { deaths: [{ name: 'Cass', cause: 'execution' }], victory: { reason: "The Evil Twin's twin was executed." } }, 'eye', 'Cass was the Evil Twin');
  check('the Vortox wins on a day with no execution at all',
    { deaths: [{ name: 'Old', cause: 'demon' }], victory: { reason: 'No one was executed, and the Vortox lives.' } }, 'bolt', 'Vortox wins');
  const none = vm.runInContext('pickFatalBlow(' + JSON.stringify({ deaths: [], victory: { reason: "The Mastermind's bonus day passed with no execution." } }) + ')', ctx);
  console.log('  ok    an ending with no single fresh moment falls back to the plain fade (null):', none === null);
}

function testFatalBlow() {
  console.log('\n=== FATAL BLOW: OVERLAY LIFECYCLE ===');
  const preState = { ...dayState, deaths: [] };
  vm.runInContext('S = ' + JSON.stringify(preState) + ';', ctx);
  vm.runInContext('lastPhaseKey=""; render();', ctx);

  const slayerOverState = {
    ...overState,
    deaths: [{ night: 3, name: 'Fay', cause: 'slayer' }],
  };
  vm.runInContext('S = ' + JSON.stringify(slayerOverState) + ';', ctx);
  vm.runInContext('render();', ctx);

  const flash = findFirst(ctx.document.body, n => n._className && n._className.includes('fatal-flash'));
  console.log('ok    flash overlay appears the instant the game ends on a slayer kill:', !!flash);
  console.log('ok    flash overlay names the target:', flash && flash.children[1] && flash.children[1].textContent);
  const stageUntouched = ctx.document._registry.stage.children.length === 0 || !findFirst(ctx.document._registry.stage, n => n._className === 'victory-banner');
  console.log('ok    the actual reveal has not been drawn yet, underneath the flash:', stageUntouched);

  setTimeout(() => {
    const stillThere = findFirst(ctx.document.body, n => n._className && n._className.includes('fatal-flash'));
    const revealed = findFirst(ctx.document._registry.stage, n => n._className === 'victory-banner');
    console.log('ok    flash overlay is gone after its cycle:', !stillThere);
    console.log('ok    the reveal screen is drawn once the flash finishes:', !!revealed);
    process.exit(0);
  }, 2700);
}
