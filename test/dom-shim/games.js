'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

class FakeNode {
  constructor(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this._className = ''; this._text = ''; this._html = '';
    this.children = []; this.parent = null; this.style = {}; this.attrs = {};
    this.onclick = null;
  }
  get className() { return this._className; }
  set className(v) { this._className = v; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get firstChild() { return this.children[0] || null; }
  // Missing until now — games.html's own renderDetail() calls
  // `summary.lastChild.append(...)` to attach the shareable-recap line
  // to whichever <p> it just appended, and with this absent the real
  // bug was invisible: `undefined.append` throws, which the page's own
  // fetch chain silently turns into "Could not load this game." (its
  // genuine network-failure fallback), so the detail view *looked*
  // like it just hadn't finished loading rather than having crashed.
  get lastChild() { return this.children[this.children.length - 1] || null; }
  setAttribute(k, v) { this.attrs[k] = v; }
  append(...nodes) { for (const n of nodes) this.appendChild(n); }
  appendChild(n) { if (n == null) throw new Error('appendChild(null)'); n.parent = this; this.children.push(n); return n; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  querySelector(sel) {
    // Only ever asked for 'table' or '.loadmore' here — good enough for that.
    const tag = sel.startsWith('.') ? null : sel.toUpperCase();
    const cls = sel.startsWith('.') ? sel.slice(1) : null;
    const walk = node => {
      for (const c of node.children || []) {
        if ((tag && c.tagName === tag) || (cls && c.className && c.className.split(/\s+/).includes(cls))) return c;
        const found = walk(c);
        if (found) return found;
      }
      return null;
    };
    return walk(this);
  }
}

function makeDocument() {
  const registry = { view: new FakeNode('div') };
  return {
    createElement: t => new FakeNode(t),
    createTextNode: t => { const n = new FakeNode('#text'); n._text = String(t); return n; },
    getElementById: id => registry[id] || null,
    _registry: registry,
  };
}

function buildContext(fetchImpl, search) {
  const document = makeDocument();
  const ctx = {
    document, console,
    location: { href: '', search: search || '', reload() {} },
    URLSearchParams,
    fetch: fetchImpl,
    setTimeout, clearTimeout,
  };
  ctx.window = ctx;
  return ctx;
}

const GAMES_HTML = path.join(__dirname, '..', '..', 'public', 'games.html');
const scriptSrc = fs.readFileSync(GAMES_HTML, 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];

function run(search, fetchImpl) {
  const ctx = buildContext(fetchImpl, search);
  vm.createContext(ctx);
  vm.runInContext(scriptSrc, ctx, { filename: 'games.html script' });
  return ctx;
}

let failed = false;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed = true;
}

function dumpText(node, out) {
  out = out || [];
  if (node.tagName === '#text' || (node.children.length === 0 && node._text)) out.push(node._text);
  for (const c of node.children || []) dumpText(c, out);
  return out;
}

// --- List view, with data ---
try {
  const gamesPage1 = { games: [{ id: 'g2', endedAt: 2000, edition: 'bmr', playerCount: 6, winner: 'evil', reason: 'x' }], nextBefore: 1000 };
  const gamesPage2 = { games: [{ id: 'g1', endedAt: 1000, edition: 'tb', playerCount: 5, winner: 'good', reason: 'y' }], nextBefore: null };
  const votingLB = [{ profileId: 'a', name: 'Ada', correctVotes: 8, totalVotes: 10, accuracy: 0.8 }];
  const charLB = [{ characterId: 'imp', name: 'Imp', wins: 3, total: 5, winRate: 0.6 }];

  const ctx = run('', url => {
    if (url.includes('/api/leaderboard/voting')) return Promise.resolve({ json: () => Promise.resolve(votingLB) });
    if (url.includes('/api/leaderboard/characters')) return Promise.resolve({ json: () => Promise.resolve(charLB) });
    if (url.includes('before=1000')) return Promise.resolve({ json: () => Promise.resolve(gamesPage2) });
    if (url.includes('/api/games')) return Promise.resolve({ json: () => Promise.resolve(gamesPage1) });
    return Promise.reject(new Error('unexpected url ' + url));
  });

  // Let the fetch .then() chains actually resolve before inspecting the tree.
  Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve()).then(() => {
    const view = ctx.document._registry.view;
    const text = dumpText(view).join(' | ');
    check('renders the voting leaderboard entry', text.includes('Ada') && text.includes('80%'));
    check('renders the character leaderboard entry', text.includes('Imp') && text.includes('60%'));
    check('renders the first page of games', text.includes('Evil'));

    const loadMore = view.querySelector('.loadmore');
    check('a "Load more" button appears when nextBefore is set', !!loadMore);
    if (loadMore) {
      loadMore.onclick();
      Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve()).then(() => {
        const text2 = dumpText(view).join(' | ');
        check('clicking Load more appends the next page', text2.includes('Good'));
        runDetailTests();
      });
    } else {
      runDetailTests();
    }
  });
} catch (e) {
  failed = true;
  console.log('  FAIL  list view crashed');
  console.error(e);
  runDetailTests();
}

// --- Detail view ---
function runDetailTests() {
  console.log('\n(detail view)');
  try {
    const record = {
      id: 'g1', endedAt: 1000, edition: 'tb', playerCount: 3, winner: 'good', reason: 'The Demon fell.',
      players: [
        { profileId: 'a', seatName: 'Ada', characterId: 'imp', characterName: 'Imp', team: 'demon', alive: false, won: false },
        { profileId: 'b', seatName: 'Bo', characterId: 'soldier', characterName: 'Soldier', team: 'townsfolk', alive: true, won: true },
      ],
      nominations: [
        { day: 1, nominatorName: 'Bo', nomineeName: 'Ada', virginFired: false, closed: true, yesCount: 2, votes: [] },
      ],
      log: [{ night: 1, text: 'Ada was executed.', secret: false }],
    };
    const ctx = run('?id=g1', url => {
      if (url.includes('/api/game?id=g1')) return Promise.resolve({ json: () => Promise.resolve(record) });
      return Promise.reject(new Error('unexpected url ' + url));
    });
    Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve()).then(() => {
      const view = ctx.document._registry.view;
      const text = dumpText(view).join(' | ');
      check('shows the victory banner', text.includes('Good wins'));
      check('shows both players in the roster', text.includes('Ada') && text.includes('Bo'));
      check('shows the nomination tally', text.includes('2 yes'));
      check('shows the log line', text.includes('Ada was executed.'));

      console.log(failed ? '\nSOME CHECKS FAILED\n' : '\nAll games.html checks passed\n');
      process.exit(failed ? 1 : 0);
    });
  } catch (e) {
    console.log('  FAIL  detail view crashed');
    console.error(e);
    process.exit(1);
  }
}
