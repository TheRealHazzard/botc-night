'use strict';

/* Unit tests for game/llmStoryteller.js's defensive parsing — the one place
   this app makes an outbound network call. No real API key or network
   access needed: global.fetch is replaced with a fake for each case, so
   every response shape (good, truncated, refused, malformed, network
   failure, timeout) can be exercised deterministically. */

const { askStoryteller } = require('../game/llmStoryteller');

let failures = 0;
function check(label, ok, detail) {
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ok    ${label}`);
}

const realFetch = global.fetch;
const realKey = process.env.ANTHROPIC_API_KEY;
process.env.ANTHROPIC_API_KEY = 'test-key-not-real';

function mockFetch(fn) { global.fetch = fn; }
function restoreFetch() { global.fetch = realFetch; }

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

(async () => {
  // No key at all — never even attempts a fetch.
  {
    delete process.env.ANTHROPIC_API_KEY;
    let called = false;
    mockFetch(async () => { called = true; return jsonResponse(200, {}); });
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    check('no key -> ok:false, reason:no-key, no network call made', r.ok === false && r.reason === 'no-key' && !called);
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
  }

  // Happy path: a well-formed text block containing valid JSON.
  {
    mockFetch(async (url, opts) => {
      check('request hits the Messages API with the right headers', url === 'https://api.anthropic.com/v1/messages'
        && opts.headers['x-api-key'] === 'test-key-not-real'
        && opts.headers['anthropic-version'] === '2023-06-01'
        && !('Authorization' in opts.headers));
      return jsonResponse(200, {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify({ verdict: 'true' }) }],
      });
    });
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    check('well-formed reply parses to the expected object', r.ok === true && r.data.verdict === 'true');
  }

  // A non-first content block still gets found.
  {
    mockFetch(async () => jsonResponse(200, {
      stop_reason: 'end_turn',
      content: [{ type: 'thinking', text: 'ignored' }, { type: 'text', text: '{"verdict":"false"}' }],
    }));
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    check('the text block is found even when it is not content[0]', r.ok === true && r.data.verdict === 'false');
  }

  // Truncated output must not be parsed as if it were complete.
  {
    mockFetch(async () => jsonResponse(200, {
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: '{"verdict":"tr' }],
    }));
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    check('max_tokens stop reason is a hard failure, never parsed', r.ok === false && r.reason === 'truncated');
  }

  // A refusal must not be treated as a parse failure or, worse, silently ignored.
  {
    mockFetch(async () => jsonResponse(200, { stop_reason: 'refusal', content: [] }));
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    check('refusal is a distinct, explicit failure reason', r.ok === false && r.reason === 'refusal');
  }

  // Non-2xx HTTP status.
  {
    mockFetch(async () => jsonResponse(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }));
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    check('a non-2xx status fails closed with the status code in the reason', r.ok === false && r.reason === 'http-429');
  }

  // Text block present but not valid JSON.
  {
    mockFetch(async () => jsonResponse(200, {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Sure, here you go: {verdict: true}' }], // not valid JSON (unquoted key)
    }));
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    check('invalid JSON in an otherwise-normal reply fails closed, not thrown', r.ok === false && r.reason === 'invalid-json');
  }

  // No text block at all.
  {
    mockFetch(async () => jsonResponse(200, { stop_reason: 'end_turn', content: [{ type: 'tool_use' }] }));
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    check('a reply with no text block fails closed', r.ok === false && r.reason === 'no-text-block');
  }

  // Network-level failure (DNS, connection refused, etc.) must not throw out of askStoryteller.
  {
    mockFetch(async () => { throw new Error('getaddrinfo ENOTFOUND'); });
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    check('a network error is caught and reported, not thrown', r.ok === false && r.reason === 'network-error');
  }

  // Timeout: AbortSignal.timeout() rejects with a DOMException named TimeoutError.
  {
    mockFetch(async () => { const e = new Error('timed out'); e.name = 'TimeoutError'; throw e; });
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    check('a timeout is reported distinctly from a generic network error', r.ok === false && r.reason === 'timeout');
  }

  restoreFetch();
  if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = realKey;

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exit(failures ? 1 : 0);
})();
