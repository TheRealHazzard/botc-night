'use strict';
// Same fake-DOM approach used for host.html's shim test — no browser tool
// is available here, so this actually executes player.html's render logic
// under Node and clicks through every new control, to catch runtime errors
// the way a real browser's console would.

const vm = require('vm');
const fs = require('fs');
const path = require('path');

class FakeNode {
  constructor(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this._className = '';
    this._text = '';
    this._html = '';
    this.children = [];
    this.parent = null;
    this.style = {};
    this.attrs = {};
    this.disabled = false;
    this.hidden = false;
    this.onclick = null;
  }
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
  focus() {}
}

function makeDocument() {
  const registry = {};
  const doc = {
    createElement(tag) { return new FakeNode(tag); },
    createElementNS(_ns, tag) { return new FakeNode(tag); },
    createTextNode(text) { const n = new FakeNode('#text'); n._text = String(text); return n; },
    getElementById(id) { return registry[id] || null; },
    addEventListener() {},
    _registry: registry,
  };
  return doc;
}

function buildContext() {
  const document = makeDocument();
  ['app', 'scriptOverlay', 'scriptTitle', 'scriptClose', 'scriptBody', 'voteReveal', 'scriptBtn'].forEach(id => {
    document._registry[id] = new FakeNode('div');
  });
  document._registry.voteReveal.hidden = true;
  document._registry.scriptOverlay.hidden = true;
  document.body = new FakeNode('body');

  const store = {};
  const ctx = {
    document,
    console,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    navigator: { vibrate: () => {} },
    location: { reload() {} },
    alert: msg => { ctx._lastAlert = msg; },
    confirm: () => false,
    matchMedia: () => ({ matches: false }),
    fetch: (url, opts) => {
      ctx._fetchCalls.push({ url, opts });
      let data = {};
      if (url.includes('/api/tokens')) data = {};
      else if (url.includes('/api/sim/seats')) data = [];
      else if (url.includes('/api/script')) data = { edition: 'tb', characters: [] };
      else if (url.includes('/api/roster')) data = [{ id: 'p1', name: 'Bo', alive: true, connected: false }, { id: 'p2', name: 'Cy', alive: true, connected: true }];
      else if (url.includes('/api/reclaim/request')) data = { requestId: 'req123' };
      else if (url.includes('/api/reclaim/cancel')) data = { ok: true };
      return Promise.resolve({ json: () => Promise.resolve(data), ok: true });
    },
    EventSource: class { constructor() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  ctx.window = ctx;
  ctx._fetchCalls = [];
  return ctx;
}

const PLAYER_HTML = path.join(__dirname, '..', '..', 'public', 'player.html');
const scriptSrc = fs.readFileSync(PLAYER_HTML, 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];
const ctx = buildContext();

vm.createContext(ctx);
try {
  vm.runInContext(scriptSrc, ctx, { filename: 'player.html script' });
} catch (e) {
  console.error('CRASH while loading/running the top-level script:', e);
  process.exit(1);
}

const you = (overrides) => ({
  id: 'me', name: 'Ada', alive: true, ghostVoteUsed: false, color: null,
  character: { id: 'chef', name: 'Chef', team: 'townsfolk', ability: 'You know a number.' },
  ...overrides,
});

const scenarios = {
  lobby: { phase: 'lobby', you: you(), nightNumber: 0, wave: 0, windowEndsAt: null, prompt: null, submitted: false, result: null, moonchildChoice: null, slayerShot: null, voteRequest: null, simulation: false, watching: false },
  reveal: { phase: 'reveal', you: you(), nightNumber: 0, wave: 0, windowEndsAt: null, prompt: null, submitted: false, result: null, moonchildChoice: null, slayerShot: null, voteRequest: null, simulation: false, watching: false },
  'night, unanswered prompt': {
    phase: 'night', you: you(), nightNumber: 1, wave: 1, windowEndsAt: Date.now() + 20000,
    prompt: { decoy: false, characterId: 'chef', count: 1, text: 'Choose a player.', targets: [{ id: 'p2', name: 'Bo' }, { id: 'p3', name: 'Cy' }], optional: false },
    submitted: false, result: null, moonchildChoice: null, slayerShot: null, voteRequest: null, simulation: false, watching: false,
  },
  'night, submitted': {
    phase: 'night', you: you(), nightNumber: 1, wave: 1, windowEndsAt: Date.now() + 20000,
    prompt: { decoy: false, characterId: 'chef', count: 1, text: 'Choose a player.', targets: [{ id: 'p2', name: 'Bo' }], optional: false },
    submitted: true, result: null, moonchildChoice: null, slayerShot: null, voteRequest: null, simulation: false, watching: false,
  },
  'night, eyes closed': { phase: 'night', you: you(), nightNumber: 1, wave: 1, windowEndsAt: Date.now() + 20000, prompt: null, submitted: false, result: null, moonchildChoice: null, slayerShot: null, voteRequest: null, simulation: false, watching: false },
  'day, nothing to do': { phase: 'day', you: you(), nightNumber: 1, wave: 0, windowEndsAt: null, prompt: null, submitted: false, result: null, moonchildChoice: null, slayerShot: null, voteRequest: null, simulation: false, watching: false },
  'day, living vote open (fresh window)': {
    phase: 'day', you: you(), nightNumber: 1, wave: 0, windowEndsAt: null, prompt: null, submitted: false, result: null, moonchildChoice: null, slayerShot: null,
    voteRequest: { nominationId: 'n1', nomineeName: 'Bo', windowEndsAt: Date.now() + 15000, isGhostVote: false, alreadyVoted: false },
    simulation: false, watching: false,
  },
  'day, living vote (window already expired)': {
    phase: 'day', you: you(), nightNumber: 1, wave: 0, windowEndsAt: null, prompt: null, submitted: false, result: null, moonchildChoice: null, slayerShot: null,
    voteRequest: { nominationId: 'n2', nomineeName: 'Cy', windowEndsAt: Date.now() - 5000, isGhostVote: false, alreadyVoted: false },
    simulation: false, watching: false,
  },
  'day, ghost vote open': {
    phase: 'day', you: you({ alive: false, ghostVoteUsed: false }), nightNumber: 2, wave: 0, windowEndsAt: null, prompt: null, submitted: false, result: null, moonchildChoice: null, slayerShot: null,
    voteRequest: { nominationId: 'n3', nomineeName: 'Dee', windowEndsAt: Date.now() + 15000, isGhostVote: true, alreadyVoted: false },
    simulation: false, watching: false,
  },
  'day, vote + slayer shot + moonchild together': {
    phase: 'day', you: you(), nightNumber: 1, wave: 0, windowEndsAt: null, prompt: null, submitted: false, result: null,
    moonchildChoice: { targets: [{ id: 'p2', name: 'Bo' }] },
    slayerShot: { targets: [{ id: 'p2', name: 'Bo' }, { id: 'p3', name: 'Cy' }] },
    voteRequest: { nominationId: 'n4', nomineeName: 'Eli', windowEndsAt: Date.now() + 15000, isGhostVote: false, alreadyVoted: false },
    simulation: false, watching: false,
  },
  'over/reveal with result': {
    phase: 'over', you: you({ alive: false }), nightNumber: 3, wave: 0, windowEndsAt: null, prompt: null, submitted: false,
    result: { title: 'Chef', body: 'Pairs of evil: 1', names: ['Bo', 'Cy'], grimoire: null },
    moonchildChoice: null, slayerShot: null, voteRequest: null, simulation: false, watching: false,
  },
};

let failed = false;
for (const [label, state] of Object.entries(scenarios)) {
  try {
    vm.runInContext('P = ' + JSON.stringify(state) + ';', ctx);
    vm.runInContext('render();', ctx);
    console.log(`  ok    ${label}`);
  } catch (e) {
    failed = true;
    console.log(`  FAIL  ${label}`);
    console.error(e);
  }
}

// Click through every handler produced by the two richest scenarios —
// the ghost-vote toggle+buttons, and the vote+slayer+moonchild combo.
function walkAndClick(node, seen) {
  if (!node || seen.has(node)) return;
  seen.add(node);
  if (typeof node.onclick === 'function') {
    try { node.onclick(); } catch (e) { console.log('  FAIL  onclick threw:', e.message); failed = true; }
  }
  for (const c of node.children || []) walkAndClick(c, seen);
}

for (const label of ['day, ghost vote open', 'day, vote + slayer shot + moonchild together']) {
  vm.runInContext('P = ' + JSON.stringify(scenarios[label]) + ';', ctx);
  vm.runInContext('render();', ctx);
  try {
    walkAndClick(ctx.document._registry.app, new Set());
    console.log(`  ok    clicked through every handler in "${label}"`);
  } catch (e) {
    failed = true;
    console.log(`  FAIL  clicking through "${label}"`);
    console.error(e);
  }
}

function findByText(node, text, seen) {
  seen = seen || new Set();
  if (!node || seen.has(node)) return null;
  seen.add(node);
  if (node.tagName === 'BUTTON' && node.textContent === text) return node;
  for (const c of node.children || []) {
    const found = findByText(c, text, seen);
    if (found) return found;
  }
  return null;
}

// Specifically drive the full reveal cycle: vote yes -> lock (via an
// already-expired window) -> tap Reveal -> the overlay shows -> hide it.
try {
  vm.runInContext('P = ' + JSON.stringify(scenarios['day, living vote (window already expired)']) + ';', ctx);
  vm.runInContext('render();', ctx);
  vm.runInContext("activeVote.myChoice = 'yes'; activeVote.stage = 'locked'; render();", ctx);
  const revealBtn = findByText(ctx.document._registry.app, 'Reveal my vote');
  if (!revealBtn) throw new Error('Reveal button not found in the locked state');
  revealBtn.onclick();
  const overlay = ctx.document._registry.voteReveal;
  console.log('  ok    reveal overlay shows after tapping Reveal', !overlay.hidden, overlay.className);
  vm.runInContext('hideVoteReveal();', ctx);
  console.log('  ok    hideVoteReveal() clears the overlay and activeVote', overlay.hidden === true);
} catch (e) {
  failed = true;
  console.log('  FAIL  full reveal cycle');
  console.error(e);
}

// -------------------------------------------------------------------------
// Targeted checks for the color border, ghost icon, and "Lock in" rename —
// a mixed alive/dead target list, like Fortune Teller's, exercises both.
function findAll(node, pred, seen, out) {
  seen = seen || new Set(); out = out || [];
  if (!node || seen.has(node)) return out;
  seen.add(node);
  if (pred(node)) out.push(node);
  for (const c of node.children || []) findAll(c, pred, seen, out);
  return out;
}

try {
  const mixedPrompt = {
    phase: 'night', you: you(), nightNumber: 1, wave: 1, windowEndsAt: Date.now() + 20000,
    prompt: {
      decoy: false, characterId: 'fortuneteller', count: 2, text: 'Choose two players.',
      targets: [
        { id: 'p2', name: 'Bo', color: { hex: '#5b3866' }, alive: true },
        { id: 'p3', name: 'Cy', color: { hex: '#8e2226' }, alive: false },
      ],
      optional: false,
    },
    submitted: false, result: null, moonchildChoice: null, slayerShot: null, voteRequest: null, simulation: false, watching: false,
  };
  vm.runInContext('P = ' + JSON.stringify(mixedPrompt) + ';', ctx);
  vm.runInContext('picked = [];', ctx);
  vm.runInContext('render();', ctx);

  const buttons = findAll(ctx.document._registry.app, n => n.tagName === 'BUTTON' && n._className.includes('target'));
  if (buttons.length !== 2) throw new Error(`expected 2 target buttons, got ${buttons.length}`);
  const [boBtn, cyBtn] = buttons;
  if (boBtn.style.borderColor !== '#5b3866') throw new Error('alive target missing its color border: ' + boBtn.style.borderColor);
  if (cyBtn.style.borderColor !== '#8e2226') throw new Error('dead target should still show its color border: ' + cyBtn.style.borderColor);
  const cyHasGhost = cyBtn.children.some(c => c.tagName === 'SVG');
  const boHasGhost = boBtn.children.some(c => c.tagName === 'SVG');
  if (!cyHasGhost) throw new Error('dead target (Cy) is missing the ghost icon');
  if (boHasGhost) throw new Error('alive target (Bo) should not show a ghost icon');
  console.log('  ok    mixed alive/dead target list: color borders + ghost icon on the dead one only');

  // Tap both -> the button should rename itself "Lock in Bo & Cy".
  boBtn.onclick(); cyBtn.onclick();
  vm.runInContext('render();', ctx);
  const lockBtn = findByText(ctx.document._registry.app, 'Lock in Bo & Cy');
  if (!lockBtn) throw new Error('Lock in button did not adopt the chosen names once the full count was picked');
  console.log('  ok    "Lock in" button names the exact choice once ready');
} catch (e) {
  failed = true;
  console.log('  FAIL  color border / ghost icon / lock-in naming');
  console.error(e);
}

// -------------------------------------------------------------------------
// Gambler's extra "guess their character" step: Lock in must stay disabled
// until BOTH a target and a guess are picked, the submitted body must carry
// characterGuess, and picking a target alone must not be enough.
function findButtonByDeepText(root, text) {
  const candidates = findAll(root, n => n.tagName === 'BUTTON');
  return candidates.find(b => findAll(b, n => n._text === text).length > 0) || null;
}
try {
  const gamblerPrompt = {
    phase: 'night', you: you({ character: { id: 'gambler', name: 'Gambler', team: 'townsfolk', ability: 'x' } }),
    nightNumber: 2, wave: 1, windowEndsAt: Date.now() + 20000,
    prompt: {
      decoy: false, characterId: 'gambler', count: 1, text: 'Choose a player, then guess their character.',
      targets: [{ id: 'p2', name: 'Bo', alive: true }, { id: 'p3', name: 'Cy', alive: true }],
      optional: false, guessCharacter: true,
      characterOptions: [{ id: 'chef', name: 'Chef' }, { id: 'empath', name: 'Empath' }, { id: 'imp', name: 'Imp' }],
    },
    submitted: false, result: null, moonchildChoice: null, slayerShot: null, voteRequest: null, simulation: false, watching: false,
  };
  vm.runInContext('P = ' + JSON.stringify(gamblerPrompt) + ';', ctx);
  vm.runInContext('picked = []; guessedCharacter = null;', ctx);
  vm.runInContext('render();', ctx);

  const guessButtonsBefore = findAll(ctx.document._registry.app, n => n.tagName === 'BUTTON' && n._className.includes('target')).length;
  if (guessButtonsBefore !== 5) throw new Error(`expected 2 player targets + 3 character options = 5 buttons, got ${guessButtonsBefore}`);

  let lockBtn = findByText(ctx.document._registry.app, 'Lock in');
  if (!lockBtn || lockBtn.disabled !== true) throw new Error('Lock in should be disabled with nothing picked yet');

  const [boBtn] = findAll(ctx.document._registry.app, n => n.tagName === 'BUTTON' && n._className.includes('target'));
  boBtn.onclick();
  vm.runInContext('render();', ctx);
  lockBtn = findByText(ctx.document._registry.app, 'Lock in');
  if (!lockBtn || lockBtn.disabled !== true) throw new Error('Lock in should stay disabled with a target picked but no character guess yet');
  console.log('  ok    Gambler: Lock in stays disabled until both a target and a guess are picked');

  const empathBtn = findButtonByDeepText(ctx.document._registry.app, 'Empath');
  if (!empathBtn) throw new Error('character guess option "Empath" not found among the rendered buttons');
  empathBtn.onclick();
  vm.runInContext('render();', ctx);
  const readyBtn = findByText(ctx.document._registry.app, 'Lock in Bo — Empath');
  if (!readyBtn || readyBtn.disabled) throw new Error('Lock in should read "Lock in Bo — Empath" and be enabled once both are picked');
  console.log('  ok    Gambler: Lock in enables and names both the target and the guess');

  ctx._fetchCalls.length = 0;
  readyBtn.onclick();
  const actionCall = ctx._fetchCalls.find(c => c.url === '/api/action');
  if (!actionCall) throw new Error('tapping the ready Lock in button did not submit /api/action');
  const actionBody = JSON.parse(actionCall.opts.body);
  if (actionBody.characterGuess !== 'empath') throw new Error('submitted body should carry characterGuess: "empath", got ' + JSON.stringify(actionBody));
  console.log('  ok    Gambler: submission carries the chosen characterGuess');
} catch (e) {
  failed = true;
  console.log('  FAIL  Gambler character-guess picker');
  console.error(e);
} finally {
  vm.runInContext('picked = []; guessedCharacter = null;', ctx);
}

// -------------------------------------------------------------------------
// Gossip's day-phase claim panel: pick a claim KIND first (team, exact
// character, or a count among several), then whatever that kind needs.
const resetGossipState = () => vm.runInContext(
  'gossipClaimType = null; gossipTarget = null; gossipClaimValue = null; gossipMultiTargets = []; gossipThreshold = null;', ctx);
try {
  const gossipDay = {
    phase: 'day', you: you({ character: { id: 'gossip', name: 'Gossip', team: 'townsfolk', ability: 'x' } }),
    nightNumber: 1, wave: 0, windowEndsAt: null, prompt: null, submitted: false, result: null,
    moonchildChoice: null, slayerShot: null, voteRequest: null, simulation: false, watching: false,
    gossipClaim: {
      targets: [{ id: 'p2', name: 'Bo', alive: true }, { id: 'p3', name: 'Cy', alive: false }, { id: 'p4', name: 'Dee', alive: true }],
      characterOptions: [{ id: 'chef', name: 'Chef' }, { id: 'imp', name: 'Imp' }],
    },
  };
  vm.runInContext('P = ' + JSON.stringify(gossipDay) + ';', ctx);
  resetGossipState();
  vm.runInContext('render();', ctx);

  let makeClaimBtn = findByText(ctx.document._registry.app, 'Make this claim');
  if (!makeClaimBtn || !makeClaimBtn.disabled) throw new Error('Make this claim should be disabled with nothing picked');

  // --- Team claim: kind -> player -> good/evil ---
  const teamKindBtn = findByText(ctx.document._registry.app, "A player's team");
  if (!teamKindBtn) throw new Error('"A player\'s team" claim-kind button not found');
  teamKindBtn.onclick();
  vm.runInContext('render();', ctx);
  const boBtn = findButtonByDeepText(ctx.document._registry.app, 'Bo');
  if (!boBtn) throw new Error('target "Bo" not found after picking the team-claim kind');
  boBtn.onclick();
  vm.runInContext('render();', ctx);
  const evilBtn = findByText(ctx.document._registry.app, 'Bo is evil');
  if (!evilBtn) throw new Error('"Bo is evil" button not found after picking a target');
  evilBtn.onclick();
  vm.runInContext('render();', ctx);
  makeClaimBtn = findByText(ctx.document._registry.app, 'Make this claim');
  if (!makeClaimBtn || makeClaimBtn.disabled) throw new Error('Make this claim should enable once kind + target + team are all picked');
  ctx._fetchCalls.length = 0;
  makeClaimBtn.onclick();
  let call = ctx._fetchCalls.find(c => c.url === '/api/gossip-claim');
  if (!call) throw new Error('tapping Make this claim did not submit /api/gossip-claim');
  let claimBody = JSON.parse(call.opts.body);
  if (claimBody.targetId !== 'p2' || claimBody.claimType !== 'team' || claimBody.claimValue !== 'evil') {
    throw new Error('unexpected team-claim submission body: ' + JSON.stringify(claimBody));
  }
  console.log('  ok    Gossip: team claim (kind -> player -> good/evil) submits the right body');

  // --- Character claim: kind -> player -> character ---
  resetGossipState();
  vm.runInContext('render();', ctx);
  findByText(ctx.document._registry.app, "A player's exact character").onclick();
  vm.runInContext('render();', ctx);
  findButtonByDeepText(ctx.document._registry.app, 'Bo').onclick();
  vm.runInContext('render();', ctx);
  let makeClaimBtn2 = findByText(ctx.document._registry.app, 'Make this claim');
  if (!makeClaimBtn2 || !makeClaimBtn2.disabled) throw new Error('Make this claim should stay disabled until a character is also picked');
  const impBtn = findButtonByDeepText(ctx.document._registry.app, 'Imp');
  if (!impBtn) throw new Error('character option "Imp" not found in the exact-character list');
  impBtn.onclick();
  vm.runInContext('render();', ctx);
  makeClaimBtn2 = findByText(ctx.document._registry.app, 'Make this claim');
  if (!makeClaimBtn2 || makeClaimBtn2.disabled) throw new Error('Make this claim should enable once kind + target + character are all picked');
  ctx._fetchCalls.length = 0;
  makeClaimBtn2.onclick();
  call = ctx._fetchCalls.find(c => c.url === '/api/gossip-claim');
  claimBody = JSON.parse(call.opts.body);
  if (claimBody.targetId !== 'p2' || claimBody.claimType !== 'character' || claimBody.claimValue !== 'imp') {
    throw new Error('unexpected character-claim submission body: ' + JSON.stringify(claimBody));
  }
  console.log('  ok    Gossip: exact-character claim (kind -> player -> character) submits the right body');

  // --- "At least N among {set}" claim: kind -> multi-pick -> threshold -> good/evil ---
  resetGossipState();
  vm.runInContext('render();', ctx);
  findByText(ctx.document._registry.app, 'A count among several players').onclick();
  vm.runInContext('render();', ctx);
  let makeClaimBtn3 = findByText(ctx.document._registry.app, 'Make this claim');
  if (!makeClaimBtn3 || !makeClaimBtn3.disabled) throw new Error('Make this claim should be disabled before any players are picked for a count claim');
  // No threshold row should exist yet with fewer than 2 picked.
  findButtonByDeepText(ctx.document._registry.app, 'Bo').onclick();
  vm.runInContext('render();', ctx);
  if (findByText(ctx.document._registry.app, '1')) throw new Error('a threshold number should not appear with only one player picked');
  findButtonByDeepText(ctx.document._registry.app, 'Dee').onclick();
  vm.runInContext('render();', ctx);
  const thresholdTwo = findByText(ctx.document._registry.app, '2');
  if (!thresholdTwo) throw new Error('threshold options should appear once 2 players are picked (expected "1" and "2")');
  thresholdTwo.onclick();
  vm.runInContext('render();', ctx);
  const areEvilBtn = findByText(ctx.document._registry.app, 'are evil');
  if (!areEvilBtn) throw new Error('"are evil" option not found once a threshold is picked');
  areEvilBtn.onclick();
  vm.runInContext('render();', ctx);
  makeClaimBtn3 = findByText(ctx.document._registry.app, 'Make this claim');
  if (!makeClaimBtn3 || makeClaimBtn3.disabled) throw new Error('Make this claim should enable once >=2 players, a threshold, and good/evil are all picked');
  ctx._fetchCalls.length = 0;
  makeClaimBtn3.onclick();
  call = ctx._fetchCalls.find(c => c.url === '/api/gossip-claim');
  claimBody = JSON.parse(call.opts.body);
  if (claimBody.claimType !== 'atleast' || claimBody.threshold !== 2 || claimBody.claimValue !== 'evil' ||
      JSON.stringify([...claimBody.targetIds].sort()) !== JSON.stringify(['p2', 'p4'])) {
    throw new Error('unexpected atleast-claim submission body: ' + JSON.stringify(claimBody));
  }
  console.log('  ok    Gossip: "at least N among {set}" claim submits {claimType, targetIds, threshold, claimValue}');
} catch (e) {
  failed = true;
  console.log('  FAIL  Gossip claim picker');
  console.error(e);
} finally {
  resetGossipState();
}

// -------------------------------------------------------------------------
// Timeout fallback: a full pick already made should be submitted as-is;
// an empty pick should be filled at random up to `count` and still submit.
try {
  const expiredFull = {
    phase: 'night', you: you(), nightNumber: 5, wave: 1, windowEndsAt: Date.now() - 1000,
    prompt: { decoy: false, characterId: 'monk', count: 1, text: 'Choose a player.', targets: [{ id: 'p2', name: 'Bo', alive: true }, { id: 'p3', name: 'Cy', alive: true }], optional: false },
    submitted: false, result: null, moonchildChoice: null, slayerShot: null, voteRequest: null, simulation: false, watching: false,
  };
  vm.runInContext('P = ' + JSON.stringify(expiredFull) + ';', ctx);
  vm.runInContext('picked = ["p3"]; autoSubmitted = false;', ctx);
  ctx._fetchCalls.length = 0;
  vm.runInContext('maybeAutoSubmitPrompt();', ctx);
  const call1 = ctx._fetchCalls.find(c => c.url === '/api/action');
  if (!call1) throw new Error('an already-complete pick did not auto-submit once the window expired');
  const body1 = JSON.parse(call1.opts.body);
  if (JSON.stringify(body1.targets) !== JSON.stringify(['p3'])) throw new Error('auto-submit should send the player\'s own pick untouched: ' + JSON.stringify(body1.targets));
  const guard1 = vm.runInContext('autoSubmitted', ctx);
  if (guard1 !== true) throw new Error('autoSubmitted guard was not set — a second tick would submit twice');
  console.log('  ok    timeout with a complete pick auto-submits exactly that pick, once');

  const expiredEmpty = {
    phase: 'night', you: you(), nightNumber: 5, wave: 1, windowEndsAt: Date.now() - 1000,
    prompt: { decoy: false, characterId: 'imp', count: 1, text: 'Choose a player.', targets: [{ id: 'p2', name: 'Bo', alive: true }], optional: false },
    submitted: false, result: null, moonchildChoice: null, slayerShot: null, voteRequest: null, simulation: false, watching: false,
  };
  vm.runInContext('P = ' + JSON.stringify(expiredEmpty) + ';', ctx);
  vm.runInContext('picked = []; autoSubmitted = false;', ctx);
  ctx._fetchCalls.length = 0;
  vm.runInContext('maybeAutoSubmitPrompt();', ctx);
  const call2 = ctx._fetchCalls.find(c => c.url === '/api/action');
  if (!call2) throw new Error('an empty pick did not auto-submit a random fallback once the window expired');
  const body2 = JSON.parse(call2.opts.body);
  if (JSON.stringify(body2.targets) !== JSON.stringify(['p2'])) throw new Error('with one eligible target left, the random fallback should pick it: ' + JSON.stringify(body2.targets));
  console.log('  ok    timeout with nothing picked fills the rest at random and still submits');

  const expiredGambler = {
    phase: 'night', you: you({ character: { id: 'gambler', name: 'Gambler', team: 'townsfolk', ability: 'x' } }),
    nightNumber: 5, wave: 1, windowEndsAt: Date.now() - 1000,
    prompt: {
      decoy: false, characterId: 'gambler', count: 1, text: 'Choose a player, then guess.',
      targets: [{ id: 'p2', name: 'Bo', alive: true }], optional: false, guessCharacter: true,
      characterOptions: [{ id: 'chef', name: 'Chef' }, { id: 'empath', name: 'Empath' }],
    },
    submitted: false, result: null, moonchildChoice: null, slayerShot: null, voteRequest: null, simulation: false, watching: false,
  };
  vm.runInContext('P = ' + JSON.stringify(expiredGambler) + ';', ctx);
  vm.runInContext('picked = []; guessedCharacter = null; autoSubmitted = false;', ctx);
  ctx._fetchCalls.length = 0;
  vm.runInContext('maybeAutoSubmitPrompt();', ctx);
  const call3 = ctx._fetchCalls.find(c => c.url === '/api/action');
  if (!call3) throw new Error('a Gambler with no guess picked did not auto-submit once the window expired');
  const body3 = JSON.parse(call3.opts.body);
  if (!['chef', 'empath'].includes(body3.characterGuess)) throw new Error('timeout fallback should fill in a random characterGuess: ' + JSON.stringify(body3));
  console.log('  ok    Gambler timeout fallback fills in both a target and a random character guess');
  vm.runInContext('guessedCharacter = null;', ctx);

  // A submitted or bot-watched prompt must never trigger the fallback.
  vm.runInContext('P.submitted = true; autoSubmitted = false;', ctx);
  ctx._fetchCalls.length = 0;
  vm.runInContext('maybeAutoSubmitPrompt();', ctx);
  if (ctx._fetchCalls.some(c => c.url === '/api/action')) throw new Error('an already-submitted prompt should never be auto-submitted again');
  console.log('  ok    an already-submitted prompt is left alone');
} catch (e) {
  failed = true;
  console.log('  FAIL  timeout auto-submit fallback');
  console.error(e);
}

// -------------------------------------------------------------------------
// Sects & Violets' Philosopher: a choiceCount-0, guessCharacter-only prompt
// (no player targets at all) must still render as a real prompt rather than
// falling through to a decoy, and Lock in must gate on the character pick
// alone — this is the exact promptFor gap the engine had to be patched for.
try {
  const philosopherPrompt = {
    phase: 'night', you: you({ character: { id: 'philosopher', name: 'Philosopher', team: 'townsfolk', ability: 'x' } }),
    nightNumber: 1, wave: 1, windowEndsAt: Date.now() + 20000,
    prompt: {
      decoy: false, characterId: 'philosopher', count: 0, text: "You may gain a good character's ability.",
      targets: [], optional: true, guessCharacter: true,
      characterOptions: [{ id: 'dreamer', name: 'Dreamer' }, { id: 'oracle', name: 'Oracle' }],
    },
    submitted: false, result: null, moonchildChoice: null, klutzChoice: null, slayerShot: null, jugglerGuess: null, voteRequest: null, simulation: false, watching: false,
  };
  vm.runInContext('P = ' + JSON.stringify(philosopherPrompt) + ';', ctx);
  vm.runInContext('picked = []; guessedCharacter = null;', ctx);
  vm.runInContext('render();', ctx);
  const lockInBefore = findByText(ctx.document._registry.app, 'Lock in');
  if (!lockInBefore || !lockInBefore.disabled) throw new Error('Lock in should start disabled with no character chosen');
  const passBtn = findByText(ctx.document._registry.app, 'Pass — choose no one');
  if (!passBtn) throw new Error('an optional character-only choice should still offer Pass');
  console.log('  ok    Philosopher: real prompt renders with zero player targets, Lock in starts disabled, Pass is offered');

  const dreamerOpt = findButtonByDeepText(ctx.document._registry.app, 'Dreamer');
  if (!dreamerOpt) throw new Error('character option button not found');
  dreamerOpt.onclick();
  const lockInAfter = findByText(ctx.document._registry.app, 'Lock in Dreamer');
  if (!lockInAfter || lockInAfter.disabled) throw new Error('Lock in should enable and name the chosen character once picked');
  console.log('  ok    Philosopher: Lock in enables and names the chosen character');

  ctx._fetchCalls.length = 0;
  lockInAfter.onclick();
  const call = ctx._fetchCalls.find(c => c.url === '/api/action');
  if (!call) throw new Error('Lock in did not submit');
  const body = JSON.parse(call.opts.body);
  if (JSON.stringify(body.targets) !== '[]' || body.characterGuess !== 'dreamer') {
    throw new Error('expected empty targets + characterGuess "dreamer": ' + JSON.stringify(body));
  }
  console.log('  ok    Philosopher: submission carries zero targets and the chosen characterGuess');

  // Passing: no character picked, empty targets — a legitimate omission.
  vm.runInContext('P = ' + JSON.stringify(philosopherPrompt) + ';', ctx);
  vm.runInContext('picked = []; guessedCharacter = null;', ctx);
  vm.runInContext('render();', ctx);
  const passBtn2 = findByText(ctx.document._registry.app, 'Pass — choose no one');
  ctx._fetchCalls.length = 0;
  passBtn2.onclick();
  const passCall = ctx._fetchCalls.find(c => c.url === '/api/action');
  if (!passCall) throw new Error('Pass did not submit');
  const passBody = JSON.parse(passCall.opts.body);
  if (JSON.stringify(passBody.targets) !== '[]' || passBody.characterGuess) {
    throw new Error('a pass should submit empty targets and no characterGuess: ' + JSON.stringify(passBody));
  }
  console.log('  ok    Philosopher: Pass submits empty targets with no characterGuess');
} catch (e) {
  failed = true;
  console.log('  FAIL  Philosopher character-only prompt');
  console.error(e);
}

// -------------------------------------------------------------------------
// Klutz: the "acts from beyond" public choice, same shape as the
// Moonchild's, but posting to /api/klutz-choice instead.
try {
  const klutzScenario = {
    phase: 'day', you: you({ alive: false }), nightNumber: 2, wave: 0, windowEndsAt: null, prompt: null, submitted: false, result: null,
    moonchildChoice: null, slayerShot: null, jugglerGuess: null,
    klutzChoice: { targets: [{ id: 'p2', name: 'Bo' }, { id: 'p3', name: 'Cy' }] },
    voteRequest: null, simulation: false, watching: false,
  };
  vm.runInContext('P = ' + JSON.stringify(klutzScenario) + ';', ctx);
  vm.runInContext('klutzTarget = null;', ctx);
  vm.runInContext('render();', ctx);
  const chooseBtn = findByText(ctx.document._registry.app, 'Choose');
  if (!chooseBtn || !chooseBtn.disabled) throw new Error('Choose should start disabled with no target picked');

  const boBtn = findButtonByDeepText(ctx.document._registry.app, 'Bo');
  if (!boBtn) throw new Error('target button for Bo not found');
  boBtn.onclick();
  const chooseBtn2 = findByText(ctx.document._registry.app, 'Choose');
  if (chooseBtn2.disabled) throw new Error('Choose should enable once a target is picked');

  ctx._fetchCalls.length = 0;
  chooseBtn2.onclick();
  const call = ctx._fetchCalls.find(c => c.url === '/api/klutz-choice');
  if (!call) throw new Error('Choose did not call /api/klutz-choice');
  const body = JSON.parse(call.opts.body);
  if (body.targetId !== 'p2') throw new Error('wrong targetId sent: ' + JSON.stringify(body));
  console.log('  ok    Klutz: choosing a player posts to /api/klutz-choice with the right targetId');
} catch (e) {
  failed = true;
  console.log('  FAIL  Klutz public choice');
  console.error(e);
}

// -------------------------------------------------------------------------
// Juggler: build up to 5 (player, character) guesses on the first day, then
// submit them all to /api/juggler-guess.
try {
  const jugglerScenario = {
    phase: 'day', you: you({ character: { id: 'juggler', name: 'Juggler', team: 'townsfolk', ability: 'x' } }),
    nightNumber: 1, wave: 0, windowEndsAt: null, prompt: null, submitted: false, result: null,
    moonchildChoice: null, slayerShot: null, klutzChoice: null,
    jugglerGuess: {
      targets: [{ id: 'p2', name: 'Bo' }, { id: 'p3', name: 'Cy' }],
      characterOptions: [{ id: 'chef', name: 'Chef' }, { id: 'imp', name: 'Imp' }],
    },
    voteRequest: null, simulation: false, watching: false,
  };
  vm.runInContext('P = ' + JSON.stringify(jugglerScenario) + ';', ctx);
  vm.runInContext('jugglerGuesses = []; jugglerPickingFor = null;', ctx);
  vm.runInContext('render();', ctx);

  const boOpt = findButtonByDeepText(ctx.document._registry.app, 'Bo');
  if (!boOpt) throw new Error('player option (Bo) not found');
  boOpt.onclick();
  const chefOpt = findButtonByDeepText(ctx.document._registry.app, 'Chef');
  if (!chefOpt) throw new Error('character option (Chef) not found after picking a player');
  chefOpt.onclick();

  const guesses1 = vm.runInContext('jugglerGuesses', ctx);
  if (guesses1.length !== 1 || guesses1[0].playerId !== 'p2' || guesses1[0].characterGuess !== 'chef') {
    throw new Error('expected one guess {p2, chef}: ' + JSON.stringify(guesses1));
  }
  console.log('  ok    Juggler: picking a player then a character records one guess');

  const submitBtn = findByText(ctx.document._registry.app, 'Submit 1 guess');
  if (!submitBtn) throw new Error('Submit button did not name the pending guess count');
  ctx._fetchCalls.length = 0;
  submitBtn.onclick();
  const call = ctx._fetchCalls.find(c => c.url === '/api/juggler-guess');
  if (!call) throw new Error('Submit did not call /api/juggler-guess');
  const body = JSON.parse(call.opts.body);
  if (!Array.isArray(body.guesses) || body.guesses.length !== 1 || body.guesses[0].characterGuess !== 'chef') {
    throw new Error('wrong guesses payload: ' + JSON.stringify(body));
  }
  console.log('  ok    Juggler: submission carries the built-up guesses array');
} catch (e) {
  failed = true;
  console.log('  FAIL  Juggler first-day guesses');
  console.error(e);
}

// -------------------------------------------------------------------------
// Sects & Violets' Savant: a single tap, no target of any kind.
try {
  const savantScenario = {
    phase: 'day', you: you({ character: { id: 'savant', name: 'Savant', team: 'townsfolk', ability: 'x' } }),
    nightNumber: 2, wave: 0, windowEndsAt: null, prompt: null, submitted: false, result: null,
    moonchildChoice: null, slayerShot: null, klutzChoice: null, jugglerGuess: null, artistQuestion: null,
    savantVisit: true, voteRequest: null, simulation: false, watching: false,
  };
  vm.runInContext('P = ' + JSON.stringify(savantScenario) + ';', ctx);
  vm.runInContext('render();', ctx);
  const visitBtn = findByText(ctx.document._registry.app, 'Visit');
  if (!visitBtn) throw new Error('Visit button not found');
  ctx._fetchCalls.length = 0;
  visitBtn.onclick();
  const call = ctx._fetchCalls.find(c => c.url === '/api/savant-visit');
  if (!call) throw new Error('Visit did not call /api/savant-visit');
  console.log('  ok    Savant: tapping Visit posts to /api/savant-visit');
} catch (e) {
  failed = true;
  console.log('  FAIL  Savant visit');
  console.error(e);
}

// -------------------------------------------------------------------------
// Sects & Violets' Artist: the same claim-shape menu as the Gossip's, but
// its own state variables and its own endpoint.
try {
  const artistScenario = {
    phase: 'day', you: you({ character: { id: 'artist', name: 'Artist', team: 'townsfolk', ability: 'x' } }),
    nightNumber: 2, wave: 0, windowEndsAt: null, prompt: null, submitted: false, result: null,
    moonchildChoice: null, slayerShot: null, klutzChoice: null, jugglerGuess: null, savantVisit: null,
    artistQuestion: {
      targets: [{ id: 'p2', name: 'Bo', alive: true }, { id: 'p3', name: 'Cy', alive: false }],
      characterOptions: [{ id: 'chef', name: 'Chef' }, { id: 'imp', name: 'Imp' }],
    },
    voteRequest: null, simulation: false, watching: false,
  };
  vm.runInContext('P = ' + JSON.stringify(artistScenario) + ';', ctx);
  vm.runInContext('artistClaimType = null; artistTarget = null; artistClaimValue = null; artistMultiTargets = []; artistThreshold = null;', ctx);
  vm.runInContext('render();', ctx);

  const teamKind = findByText(ctx.document._registry.app, "A player's team");
  if (!teamKind) throw new Error('claim-kind picker not found');
  teamKind.onclick();
  const boBtn = findButtonByDeepText(ctx.document._registry.app, 'Bo');
  if (!boBtn) throw new Error('target button (Bo) not found after picking "team"');
  boBtn.onclick();
  const evilBtn = findByText(ctx.document._registry.app, 'Bo is evil');
  if (!evilBtn) throw new Error('"Bo is evil" option not found');
  evilBtn.onclick();

  const go = findByText(ctx.document._registry.app, 'Ask this question');
  if (!go || go.disabled) throw new Error('"Ask this question" should be enabled once kind+target+value are all picked');
  ctx._fetchCalls.length = 0;
  go.onclick();
  const call = ctx._fetchCalls.find(c => c.url === '/api/artist-question');
  if (!call) throw new Error('did not submit to /api/artist-question');
  const body = JSON.parse(call.opts.body);
  if (body.claimType !== 'team' || body.targetId !== 'p2' || body.claimValue !== 'evil') {
    throw new Error('wrong claim body: ' + JSON.stringify(body));
  }
  console.log('  ok    Artist: team claim (kind -> player -> good/evil) submits the right body');
} catch (e) {
  failed = true;
  console.log('  FAIL  Artist question');
  console.error(e);
}

// -------------------------------------------------------------------------
// The LLM Storyteller's free-text path — only offered when llmEnabled is
// true (the table's toggle AND a real key, both computed server-side into
// privateState), and shows a real waiting state since this is the one
// action in the whole app with a multi-second round trip.
try {
  const noLlmScenario = {
    phase: 'day', you: you({ character: { id: 'artist', name: 'Artist', team: 'townsfolk', ability: 'x' } }),
    nightNumber: 2, wave: 0, windowEndsAt: null, prompt: null, submitted: false, result: null,
    moonchildChoice: null, slayerShot: null, klutzChoice: null, jugglerGuess: null, savantVisit: null,
    artistQuestion: { targets: [{ id: 'p2', name: 'Bo', alive: true }], characterOptions: [{ id: 'chef', name: 'Chef' }] },
    voteRequest: null, simulation: false, watching: false, llmEnabled: false,
  };
  vm.runInContext('P = ' + JSON.stringify(noLlmScenario) + ';', ctx);
  vm.runInContext('render();', ctx);
  const noFreeKind = findByText(ctx.document._registry.app, 'Ask it in my own words');
  console.log('  ok    the free-text option is absent when llmEnabled is false', !noFreeKind);

  const llmScenario = { ...noLlmScenario, llmEnabled: true };
  vm.runInContext('P = ' + JSON.stringify(llmScenario) + ';', ctx);
  vm.runInContext('artistClaimType = null; artistFreeText = "";', ctx);
  vm.runInContext('render();', ctx);
  const freeKind = findByText(ctx.document._registry.app, 'Ask it in my own words');
  if (!freeKind) throw new Error('free-text option not found with llmEnabled:true');
  freeKind.onclick();

  const goBefore = findByText(ctx.document._registry.app, 'Ask this question');
  if (!goBefore || !goBefore.disabled) throw new Error('should stay disabled with no text typed yet');

  const box = findAll(ctx.document._registry.app, n => n.tagName === 'TEXTAREA')[0];
  if (!box) throw new Error('free-text textarea not found');
  box.value = 'Is Bo the Chef?';
  box.oninput();

  const goAfter = findByText(ctx.document._registry.app, 'Ask this question');
  if (!goAfter || goAfter.disabled) throw new Error('should enable once text is typed');

  ctx._fetchCalls.length = 0;
  goAfter.onclick();
  const call = ctx._fetchCalls.find(c => c.url === '/api/artist-question');
  if (!call) throw new Error('did not submit to /api/artist-question');
  const body = JSON.parse(call.opts.body);
  if (body.claimType !== 'freeform' || body.claimText !== 'Is Bo the Chef?' || 'targetId' in body || 'claimValue' in body) {
    throw new Error('wrong freeform body: ' + JSON.stringify(body));
  }
  console.log('  ok    Artist freeform: submits {claimType:"freeform", claimText}, no targetId/claimValue');
  console.log('  ok    Artist freeform: button shows a waiting state while the request is in flight', goAfter.textContent === 'Asking the Storyteller…');
} catch (e) {
  failed = true;
  console.log('  FAIL  LLM free-text path (Artist)');
  console.error(e);
}

// Gossip's own freeform path — the higher-stakes one (a true claim kills
// someone at random that night), so this specifically checks the toggling
// works with its own state variables, not just that the pattern was copied.
try {
  const gossipLlmScenario = {
    phase: 'day', you: you({ character: { id: 'gossip', name: 'Gossip', team: 'townsfolk', ability: 'x' } }),
    nightNumber: 2, wave: 0, windowEndsAt: null, prompt: null, submitted: false, result: null,
    moonchildChoice: null, slayerShot: null, klutzChoice: null, jugglerGuess: null, savantVisit: null, artistQuestion: null,
    gossipClaim: { targets: [{ id: 'p2', name: 'Bo', alive: true }], characterOptions: [{ id: 'chef', name: 'Chef' }] },
    voteRequest: null, simulation: false, watching: false, llmEnabled: true,
  };
  vm.runInContext('P = ' + JSON.stringify(gossipLlmScenario) + ';', ctx);
  vm.runInContext('gossipClaimType = null; gossipFreeText = "";', ctx);
  vm.runInContext('render();', ctx);

  const freeKind = findByText(ctx.document._registry.app, 'Say it in your own words');
  if (!freeKind) throw new Error('free-text option not found with llmEnabled:true');
  freeKind.onclick();

  const box = findAll(ctx.document._registry.app, n => n.tagName === 'TEXTAREA')[0];
  if (!box) throw new Error('free-text textarea not found');
  const goBefore = findByText(ctx.document._registry.app, 'Make this claim');
  if (!goBefore || !goBefore.disabled) throw new Error('should stay disabled with no text typed yet');

  box.value = 'Bo is not on the good team.';
  box.oninput();
  console.log('  ok    Gossip freeform: the submit button enables on typing, without a full re-render', goBefore.disabled === false);

  ctx._fetchCalls.length = 0;
  goBefore.onclick();
  const call = ctx._fetchCalls.find(c => c.url === '/api/gossip-claim');
  if (!call) throw new Error('did not submit to /api/gossip-claim');
  const body = JSON.parse(call.opts.body);
  if (body.claimType !== 'freeform' || body.claimText !== 'Bo is not on the good team.') {
    throw new Error('wrong freeform body: ' + JSON.stringify(body));
  }
  console.log('  ok    Gossip freeform: submits {claimType:"freeform", claimText}');
} catch (e) {
  failed = true;
  console.log('  FAIL  LLM free-text path (Gossip)');
  console.error(e);
}

// -------------------------------------------------------------------------
// Sects & Violets' Mutant/Cerenovus "madness": a single public-claim button.
try {
  const madScenario = {
    phase: 'day', you: you(), nightNumber: 2, wave: 0, windowEndsAt: null, prompt: null, submitted: false, result: null,
    moonchildChoice: null, slayerShot: null, klutzChoice: null, jugglerGuess: null, savantVisit: null, artistQuestion: null,
    madClaim: { label: 'an Outsider' }, voteRequest: null, simulation: false, watching: false,
  };
  vm.runInContext('P = ' + JSON.stringify(madScenario) + ';', ctx);
  vm.runInContext('render();', ctx);
  const claimBtn = findByText(ctx.document._registry.app, 'Claim it');
  if (!claimBtn) throw new Error('Claim it button not found');
  ctx._fetchCalls.length = 0;
  claimBtn.onclick();
  const call = ctx._fetchCalls.find(c => c.url === '/api/mad-claim');
  if (!call) throw new Error('Claim it did not call /api/mad-claim');
  console.log('  ok    Madness: tapping "Claim it" posts to /api/mad-claim');
} catch (e) {
  failed = true;
  console.log('  FAIL  madness claim');
  console.error(e);
}

// -------------------------------------------------------------------------
// The persistent role card should disappear specifically while choosing a
// target (night prompt, moonchild choice, slayer shot) and reappear once
// answered or once there's nothing to choose — freeing the viewport for
// the target list instead of costing it a scroll.
function hasRoleCard() {
  return findAll(ctx.document._registry.app, n => n._className === 'hold' && n._text === 'Hold to see who you are').length > 0;
}
const roleCardExpectations = {
  'lobby': true,
  'night, unanswered prompt': false,
  'night, submitted': true,
  'night, eyes closed': true,
  'day, nothing to do': true,
  'day, vote + slayer shot + moonchild together': false, // both moonchild and slayer are open here
};
for (const [label, expected] of Object.entries(roleCardExpectations)) {
  vm.runInContext('P = ' + JSON.stringify(scenarios[label]) + ';', ctx);
  vm.runInContext('render();', ctx);
  const present = hasRoleCard();
  if (present === expected) {
    console.log(`  ok    role card ${expected ? 'shown' : 'hidden'} — "${label}"`);
  } else {
    failed = true;
    console.log(`  FAIL  role card should be ${expected ? 'shown' : 'hidden'} but was ${present ? 'shown' : 'hidden'} — "${label}"`);
  }
}

// -------------------------------------------------------------------------
// Reclaim misclick: tapping the wrong name in the roster picker, then
// backing out via "Not you? Switch player" should cancel that request
// server-side (not just change the local screen) and land back on the
// roster picker, not the raw name-entry screen.
function tick(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  try {
    // The very first script load kicked off its own renderJoin() (no token
    // in localStorage), whose fetch('/api/sim/seats') is still pending —
    // none of the earlier scenario tests ever awaited a real tick, so it
    // never got a chance to resolve until now. Let it settle and overwrite
    // #app with whatever it wants before starting this test for real, so
    // it can't land in the middle of it and pollute the button count.
    await tick(20);
    vm.runInContext('renderReclaimPicker();', ctx);
    await tick(10);
    const rosterBtns = findAll(ctx.document._registry.app, n => n.tagName === 'BUTTON' && n._className !== 'linklike');
    if (rosterBtns.length !== 2) throw new Error(`expected 2 roster buttons, got ${rosterBtns.length}`);
    ctx._fetchCalls.length = 0;
    rosterBtns[0].onclick(); // misclick — meant to tap the other name
    await tick(10);

    const notYouBtns = findAll(ctx.document._registry.app, n => n.tagName === 'BUTTON' && n.textContent === 'Not you? Switch player');
    if (notYouBtns.length !== 1) throw new Error('expected exactly one "Not you? Switch player" button on the waiting screen');
    console.log('  ok    "Not you? Switch player" appears on the reclaim-waiting screen');

    ctx._fetchCalls.length = 0;
    notYouBtns[0].onclick();
    await tick(10);

    const cancelCall = ctx._fetchCalls.find(c => c.url === '/api/reclaim/cancel');
    if (!cancelCall) throw new Error('clicking "Not you?" did not call /api/reclaim/cancel');
    const cancelBody = JSON.parse(cancelCall.opts.body);
    if (cancelBody.requestId !== 'req123') throw new Error('wrong requestId sent to cancel: ' + JSON.stringify(cancelBody));
    console.log('  ok    "Not you?" cancels the pending request server-side with the right requestId');

    const backOnRoster = findAll(ctx.document._registry.app, n => n.tagName === 'BUTTON' && n._className !== 'linklike');
    if (backOnRoster.length !== 2) throw new Error('expected to land back on the roster picker (2 name buttons), not the raw join screen');
    console.log('  ok    backs out to the roster picker, not the raw name-entry screen');
  } catch (e) {
    failed = true;
    console.log('  FAIL  reclaim misclick / "Not you?" flow');
    console.error(e);
  }

  console.log(failed ? '\nSOME SCENARIOS CRASHED\n' : '\nAll scenarios rendered and every click handler ran without throwing\n');
  process.exit(failed ? 1 : 0);
})();
