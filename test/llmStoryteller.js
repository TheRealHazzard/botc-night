'use strict';

/* Unit tests for game/llmStoryteller.js's defensive parsing — the one place
   this app makes an outbound network call. No real API key or network
   access needed: global.fetch is replaced with a fake for each case, so
   every response shape (good, truncated, refused, malformed, network
   failure, timeout) can be exercised deterministically. */

const fs = require('fs');
const path = require('path');
const { askStoryteller, status } = require('../game/llmStoryteller');

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

  // status() reflects which provider is active and whether it looks
  // configured — never a network check, just what the Settings panel shows.
  {
    delete process.env.LLM_PROVIDER;
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
    const s = status();
    check('default provider is anthropic', s.provider === 'anthropic');
    check('anthropic status.configured tracks ANTHROPIC_API_KEY presence', s.configured === true && s.model === 'claude-haiku-4-5-20251001');
    delete process.env.ANTHROPIC_API_KEY;
    check('anthropic status.configured is false with no key', status().configured === false);
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
  }

  const realProvider = process.env.LLM_PROVIDER;
  const realOllamaModel = process.env.OLLAMA_MODEL;
  const realOllamaHost = process.env.OLLAMA_HOST;
  process.env.LLM_PROVIDER = 'ollama';

  // Ollama status is "configured" purely from LLM_PROVIDER being set — no
  // API key exists for a local server, and a live reachability check has no
  // place in something read synchronously on every state push.
  {
    delete process.env.OLLAMA_MODEL;
    const s = status();
    check('provider switches to ollama via LLM_PROVIDER', s.provider === 'ollama');
    check('ollama is always "configured" (no key needed) and defaults to qwen2.5:14b-instruct-q4_K_M', s.configured === true && s.model === 'qwen2.5:14b-instruct-q4_K_M');
    process.env.OLLAMA_MODEL = 'llama3.1:8b';
    check('OLLAMA_MODEL overrides the default', status().model === 'llama3.1:8b');
    delete process.env.OLLAMA_MODEL;
  }

  // Happy path: Ollama's native /api/chat, format-constrained, message.content holds the JSON.
  {
    mockFetch(async (url, opts) => {
      const body = JSON.parse(opts.body);
      check('request hits Ollama\'s native chat endpoint, not the OpenAI-compat one', url === 'http://localhost:11434/api/chat');
      check('the JSON schema is passed directly as `format`, no request-wrapper', body.format && body.format.type === 'object');
      check('maxTokens becomes options.num_predict', body.options.num_predict === 300);
      return jsonResponse(200, { done_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ verdict: 'true' }) } });
    });
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: { type: 'object' } });
    check('well-formed Ollama reply parses to the expected object', r.ok === true && r.data.verdict === 'true');
  }

  // OLLAMA_HOST override actually changes where the request goes.
  {
    process.env.OLLAMA_HOST = 'http://other-box:11434';
    mockFetch(async (url) => {
      check('OLLAMA_HOST overrides the default localhost URL', url === 'http://other-box:11434/api/chat');
      return jsonResponse(200, { done_reason: 'stop', message: { content: '{"verdict":"true"}' } });
    });
    await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    if (realOllamaHost === undefined) delete process.env.OLLAMA_HOST; else process.env.OLLAMA_HOST = realOllamaHost;
  }

  // done_reason:'length' is Ollama's truncation signal — same hard-failure treatment as Anthropic's stop_reason:'max_tokens'.
  {
    mockFetch(async () => jsonResponse(200, { done_reason: 'length', message: { content: '{"verdict":"tr' } }));
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    check('Ollama hitting its output cap is a hard failure, never parsed', r.ok === false && r.reason === 'truncated');
  }

  // Invalid JSON in an otherwise-normal Ollama reply.
  {
    mockFetch(async () => jsonResponse(200, { done_reason: 'stop', message: { content: 'Sure, here you go: {verdict: true}' } }));
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    check('invalid JSON from Ollama fails closed, not thrown', r.ok === false && r.reason === 'invalid-json');
  }

  // No message content at all.
  {
    mockFetch(async () => jsonResponse(200, { done_reason: 'stop', message: {} }));
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    check('an Ollama reply with no content fails closed', r.ok === false && r.reason === 'no-text-block');
  }

  // Network-level failure must not throw out of askStoryteller for Ollama either.
  {
    mockFetch(async () => { throw new Error('ECONNREFUSED'); });
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    check('a network error against Ollama is caught and reported, not thrown', r.ok === false && r.reason === 'network-error');
  }

  // A non-2xx HTTP status (e.g. the model name doesn't exist locally).
  {
    mockFetch(async () => jsonResponse(404, { error: 'model not found' }));
    const r = await askStoryteller({ system: 's', prompt: 'p', schema: {} });
    check('a non-2xx status from Ollama fails closed with the status code in the reason', r.ok === false && r.reason === 'http-404');
  }

  if (realProvider === undefined) delete process.env.LLM_PROVIDER; else process.env.LLM_PROVIDER = realProvider;
  if (realOllamaModel === undefined) delete process.env.OLLAMA_MODEL; else process.env.OLLAMA_MODEL = realOllamaModel;

  restoreFetch();
  if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = realKey;

  // additionalProperties: false is a hard requirement for every object in a
  // structured-output schema (Anthropic rejects the whole request with a
  // 400 without it) — this bit both schemas server.js actually sends
  // (judgeFreeformClaim's VERDICT_SCHEMA, rephraseSavantStatements' own)
  // before, silently: askStoryteller() correctly fails closed on a 400, so
  // every caller's documented fallback fired every time, meaning the LLM
  // path itself never actually ran on any table that enabled it. No test
  // above catches this — every schema passed is a trivial `{}` — because
  // it's a request-validity problem, not something a mocked fetch
  // response can surface. A source-text check is blunt but direct: it's
  // guarding the actual schema literals in server.js, not a fetch mock.
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const verdictSchema = serverSrc.match(/const VERDICT_SCHEMA = \{[\s\S]*?\n\};/);
  const savantSchema = serverSrc.match(/schema:\s*\{[\s\S]*?\n\s*\},\n\s*maxTokens: 200,/);
  check('VERDICT_SCHEMA literal was found in server.js (regex sanity check)', !!verdictSchema);
  check('rephraseSavantStatements\' inline schema literal was found in server.js (regex sanity check)', !!savantSchema);
  if (verdictSchema) {
    check('VERDICT_SCHEMA sets additionalProperties: false (required by Anthropic\'s structured-output API)',
      /additionalProperties:\s*false/.test(verdictSchema[0]));
  }
  if (savantSchema) {
    check('rephraseSavantStatements\' schema sets additionalProperties: false (required by Anthropic\'s structured-output API)',
      /additionalProperties:\s*false/.test(savantSchema[0]));
  }

  console.log(`\n${failures ? failures + ' FAILURES' : 'All checks passed'}\n`);
  process.exit(failures ? 1 : 0);
})();
