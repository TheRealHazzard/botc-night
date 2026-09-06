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

function makeDocument() {
  const registry = {};
  return {
    createElement: t => new FakeNode(t), createElementNS: (_n, t) => new FakeNode(t),
    createTextNode: t => { const n = new FakeNode('#text'); n._text = String(t); return n; },
    getElementById: id => registry[id] || null, documentElement: new FakeNode('html'),
    body: new FakeNode('body'), _registry: registry,
  };
}

const document = makeDocument();
['phase', 'stage', 'controls', 'reclaimBanner', 'brandIcon'].forEach(id => { document._registry[id] = new FakeNode('div'); });
document._registry.muteBtn = new FakeNode('button');
document._registry.settingsBtn = new FakeNode('button');
const fetchCalls = [];
const postBodies = [];
// Tracked here, not read back out of the vm's own `S` (a top-level `let`
// inside vm-run code lives in that context's lexical environment, not as a
// property of the contextified object — `ctx.S` from out here would just be
// undefined) — settingsOverlay() expects /api/table/config to echo the full
// merged config, the same shape the real server returns.
let mockConfig = null;
const SCRIPTS_FIXTURE = [
  { id: 'tb', name: 'Trouble Brewing', description: 'x', difficulty: 1, playable: true, characterCount: 22, gamesPlayed: 0 },
  { id: 'bmr', name: 'Bad Moon Rising', description: 'x', difficulty: 2, playable: true, characterCount: 25, gamesPlayed: 0 },
  { id: 'sv', name: 'Sects & Violets', description: 'x', difficulty: 3, playable: true, characterCount: 25, gamesPlayed: 0 },
];
const localStorageStore = {};
const ctx = {
  window: { AudioContext: FakeAudioContext }, document, console,
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

function findFirst(node, pred) {
  if (!node) return null;
  if (pred(node)) return node;
  for (const c of node.children || []) { const f = findFirst(c, pred); if (f) return f; }
  return null;
}

// The Tonight card's own /api/session/current fetch resolves on a
// microtask — give it a tick before dumping so it's had a chance to land.
setTimeout(() => {
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
  vm.runInContext('playSlayerImpact();', ctx);
  console.log('  ok    playSlayerImpact: sub-bass thud + noise crack + rumble:', toneCalls.length >= 1 && noiseCalls.length >= 2);

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
  testSlayerFlash();
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

// A Slayer's shot that ends the game should play the flash overlay instead
// of the usual fade, and only reveal the actual 'over' screen once it's
// done — exercised through render() itself (not renderNow()), since that's
// where the detection lives.
function testSlayerFlash() {
  console.log('\n=== SLAYER FLASH ===');
  const preState = { ...dayState, deaths: [] };
  vm.runInContext('S = ' + JSON.stringify(preState) + ';', ctx);
  vm.runInContext('lastPhaseKey=""; render();', ctx);

  const slayerOverState = {
    ...overState,
    deaths: [{ night: 3, name: 'Fay', cause: 'slayer' }],
  };
  vm.runInContext('S = ' + JSON.stringify(slayerOverState) + ';', ctx);
  vm.runInContext('render();', ctx);

  const flash = findFirst(ctx.document.body, n => n._className && n._className.includes('slayer-flash'));
  console.log('ok    flash overlay appears the instant the game ends on a slayer kill:', !!flash);
  console.log('ok    flash overlay names the target:', flash && flash.children[1] && flash.children[1].textContent);
  const stageUntouched = ctx.document._registry.stage.children.length === 0 || !findFirst(ctx.document._registry.stage, n => n._className === 'victory-banner');
  console.log('ok    the actual reveal has not been drawn yet, underneath the flash:', stageUntouched);

  setTimeout(() => {
    const stillThere = findFirst(ctx.document.body, n => n._className && n._className.includes('slayer-flash'));
    const revealed = findFirst(ctx.document._registry.stage, n => n._className === 'victory-banner');
    console.log('ok    flash overlay is gone after its cycle:', !stillThere);
    console.log('ok    the reveal screen is drawn once the flash finishes:', !!revealed);
    process.exit(0);
  }, 2700);
}
