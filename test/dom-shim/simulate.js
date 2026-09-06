'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

class FakeNode {
  constructor(tag) {
    this.tagName = String(tag || '').toUpperCase();
    this._className = ''; this._text = ''; this._html = '';
    this.children = []; this.parent = null; this.attrs = {};
    this.style = { setProperty: (k, v) => { this.style[k] = v; }, removeProperty: k => { delete this.style[k]; } };
    this.disabled = false; this.hidden = false; this.onclick = null; this.onchange = null; this._selectedIndex = 0;
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
      toggle(c, on) { const has = self._className.split(/\s+/).includes(c); const want = on === undefined ? !has : on; if (want && !has) this.add(c); if (!want && has) this.remove(c); },
      contains(c) { return self._className.split(/\s+/).includes(c); },
    };
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  setAttributeNS(_ns, k, v) { this.attrs[k] = v; }
  get dataset() { return this.attrs; }
  append(...nodes) { for (const n of nodes) this.appendChild(n); }
  prepend(...nodes) { for (const n of nodes.reverse()) { n.parent = this; this.children.unshift(n); } }
  appendChild(n) { if (n == null) throw new Error('appendChild called with null/undefined'); n.parent = this; this.children.push(n); return n; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  addEventListener() {}
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
['run', 'players', 'speed', 'pause', 'modeObserver', 'modePlayer', 'modeTV', 'focus', 'wrap', 'tvWrap'].forEach(id => {
  document._registry[id] = new FakeNode(id === 'focus' ? 'select' : (id === 'players' || id === 'speed' ? 'input' : 'div'));
});

const fetchLog = [];
const ctx = {
  window: {}, document, console,
  location: { host: 'x:3000', protocol: 'http:', origin: 'http://x:3000', reload() {} },
  matchMedia: () => ({ matches: false }), alert: msg => console.log('ALERT:', msg), confirm: () => false,
  fetch: (url, opts) => { fetchLog.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); },
  EventSource: class { constructor(url) { fetchLog.push('EventSource:' + url); } close() {} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  Option: class { constructor(t, v) { this.text = t; this.value = v; } },
};
ctx.globalThis = ctx;
vm.createContext(ctx);

const SIMULATE_HTML = path.join(__dirname, '..', '..', 'public', 'simulate.html');
try {
  vm.runInContext(fs.readFileSync(SIMULATE_HTML, 'utf8').match(/<script>([\s\S]*)<\/script>/)[1], ctx, { filename: 'simulate.html script' });
} catch (e) {
  console.error('CRASH while loading/running the top-level script:', e);
  process.exit(1);
}

const realPayload = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'real-sim-payload.json'), 'utf8'));
console.log('Loaded real payload — table.phase:', realPayload.table.phase, '| seats:', realPayload.seats.length);

try {
  vm.runInContext('S = ' + JSON.stringify(realPayload) + ';', ctx);
  vm.runInContext('render();', ctx);
  console.log('ok    initial render() with real payload did not throw');
} catch (e) {
  console.log('FAIL  initial render() threw:', e.message);
  console.error(e);
  process.exit(1);
}

function findAll(node, pred, out) {
  out = out || [];
  if (!node) return out;
  if (pred(node)) out.push(node);
  for (const c of node.children || []) findAll(c, pred, out);
  return out;
}

const wrap = ctx.document._registry.wrap;
const seatCards = findAll(wrap, n => n._className && n._className.split(/\s+/).includes('seat'));
console.log('seat cards rendered:', seatCards.length);
if (!seatCards.length) { console.log('FAIL  no seat cards found to click'); process.exit(1); }

console.log('mode before click:', vm.runInContext('mode', ctx));
try {
  seatCards[0].onclick();
  console.log('ok    clicking the first seat card did not throw');
} catch (e) {
  console.log('FAIL  clicking a seat card threw:', e.message);
  console.error(e);
  process.exit(1);
}
console.log('mode after click:', vm.runInContext('mode', ctx));
console.log('focusId after click:', vm.runInContext('focusId', ctx));
console.log('modePlayer button now has .on class:', document._registry.modePlayer._className.includes('on'));
console.log('wrap now contains a .phonewrap (the player view):', findAll(wrap, n => n._className === 'phonewrap').length === 1);

console.log(fetchLog.length ? '\nfetch/EventSource calls made during load: ' + JSON.stringify(fetchLog) : '');
process.exit(0);
