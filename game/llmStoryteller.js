'use strict';
// A thin, I/O-only wrapper around the LLM backend — the one place this app
// makes an outbound network call. Deliberately NOT required by
// game/engine.js (whose every export tools/simulate.js's ~2000 assertions
// call synchronously, with no mocking layer — that only works because
// engine.js touches neither the network nor process.env). Modeled on
// game/history.js: a game-adjacent module that isn't pure engine logic but
// isn't server.js either, required alongside E in server.js.
//
// Two providers, picked by LLM_PROVIDER (default 'anthropic'):
//   - anthropic: Node's built-in global fetch (Node >=18, already this
//     project's minimum) against Anthropic's raw Messages API. No SDK
//     dependency — this project has none, on purpose (see the v1.0
//     showcase) — there is exactly one call shape needed here (a
//     single-turn, non-streaming, short, schema-constrained reply), which
//     is exactly the case where an SDK buys nothing an SDK would otherwise
//     be carried around for.
//   - ollama: the same fetch call against a local Ollama server instead —
//     no API key, no per-call cost, game state never leaves the machine.
//     Chosen for beta testing (see the LLM_PROVIDER doc below) before this
//     project is handed to people who'd otherwise each need their own
//     Anthropic billing just to try Bucket 4 characters.
//
// Both providers return the exact same {ok:true,data} | {ok:false,reason}
// shape, so every caller in server.js (judgeFreeformClaim,
// rephraseSavantStatements, llmWhimJudge) is provider-agnostic and needed
// zero changes to support Ollama.
//
// Used by server.js for Sects & Violets' Savant/Gossip/Artist — the three
// "Bucket 4" characters (see BUCKET4_IDS in helpers.js) whose ability
// reduces "ask/tell the Storyteller something open-ended" to a menu or
// template for lack of a real Storyteller — plus the Mayor/Recluse-Spy/
// Pacifist "whim" judgment calls. See game/ABILITY_PATTERNS.md for why free
// text was rejected there in the first place, and the note added there
// about what changes once a real judge (this) is in the loop.

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'; // classification/rephrasing on a live table's critical path, not a reasoning task
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
// Picked over phi4 (same footprint, ~9GB, comparable warm latency) after a
// live head-to-head on the same whim-judgment prompt: qwen2.5 landed on the
// strategically consistent call in 4 of 5 trials against phi4's ~2 of 5 —
// phi4 kept defaulting to "protecting the good-aligned Mayor helps good,"
// missing the contrarian "help whoever's currently losing" instruction the
// system prompt actually asks for. Override with OLLAMA_MODEL for either.
const DEFAULT_OLLAMA_MODEL = 'qwen2.5:14b-instruct-q4_K_M';

// Read fresh on every call, never cached at module load (unlike PORT in
// server.js) — an operator can set/rotate/switch providers between games
// without this module having latched onto a stale value at require time.
function provider() {
  return (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
}
function ollamaHost() {
  return process.env.OLLAMA_HOST || DEFAULT_OLLAMA_HOST;
}
function ollamaModel() {
  return process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;
}

/**
 * @param {object} opts
 * @param {string} opts.system - system prompt
 * @param {string} opts.prompt - the one user turn
 * @param {object} opts.schema - JSON schema the reply must conform to
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{ok:true, data:object} | {ok:false, reason:string}>}
 */
async function askStoryteller(opts) {
  return provider() === 'ollama' ? askOllama(opts) : askAnthropic(opts);
}

async function askAnthropic({ system, prompt, schema, maxTokens = 300, timeoutMs = 9000 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no-key' };

  let res;
  try {
    res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey, // not Authorization: Bearer — that header form is OAuth-token-only
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
        output_config: { format: { type: 'json_schema', schema } },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // Network failure, DNS, or the AbortSignal firing (TimeoutError) all land here.
    return { ok: false, reason: e.name === 'TimeoutError' ? 'timeout' : 'network-error' };
  }

  if (!res.ok) return { ok: false, reason: `http-${res.status}` };

  let body;
  try {
    body = await res.json();
  } catch (e) {
    return { ok: false, reason: 'bad-response-json' };
  }

  if (body.stop_reason === 'max_tokens') return { ok: false, reason: 'truncated' };
  if (body.stop_reason === 'refusal') return { ok: false, reason: 'refusal' };

  const textBlock = Array.isArray(body.content) ? body.content.find(b => b.type === 'text') : null;
  if (!textBlock || typeof textBlock.text !== 'string') return { ok: false, reason: 'no-text-block' };

  let data;
  try {
    data = JSON.parse(textBlock.text);
  } catch (e) {
    return { ok: false, reason: 'invalid-json' };
  }

  // No retry: the schema constraint already makes malformed output the rare
  // case, not the common one — re-rolling the same non-deterministic model
  // against the same ambiguous input buys nothing but 2x latency on an
  // already-slow synchronous path.
  return { ok: true, data };
}

/**
 * Same contract as askAnthropic. Talks to Ollama's own native /api/chat
 * (not its OpenAI-compat endpoint) — `format` takes the raw JSON schema
 * directly with no request-wrapper, and `options.num_predict` is Ollama's
 * name for a max-output-tokens cap; both confirmed against a real running
 * local server rather than assumed from docs. `done_reason: 'length'` is
 * Ollama's equivalent of Anthropic's `stop_reason: 'max_tokens'` — hitting
 * the cap fails closed the same way, never parsed as if complete.
 *
 * A much longer default timeout than Anthropic's: local inference has no
 * per-call dollar cost, so "slow but correct" beats "fails closed to the
 * heuristic fallback" — measured directly against this project's own dev
 * machine, a cold/unloaded 14B Q4 model took ~30s just to load into VRAM
 * before generating a single token, then <1s per call once warm. Anthropic's
 * 9s default would treat every cold start as a hard failure.
 */
async function askOllama({ system, prompt, schema, maxTokens = 300, timeoutMs = 60000 }) {
  let res;
  try {
    res = await fetch(`${ollamaHost()}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        stream: false,
        format: schema,
        options: { num_predict: maxTokens },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    return { ok: false, reason: e.name === 'TimeoutError' ? 'timeout' : 'network-error' };
  }

  if (!res.ok) return { ok: false, reason: `http-${res.status}` };

  let body;
  try {
    body = await res.json();
  } catch (e) {
    return { ok: false, reason: 'bad-response-json' };
  }

  if (body.done_reason === 'length') return { ok: false, reason: 'truncated' };

  const text = body.message && body.message.content;
  if (typeof text !== 'string' || !text) return { ok: false, reason: 'no-text-block' };

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'invalid-json' };
  }

  return { ok: true, data };
}

/** What the host's Settings panel shows the operator. Never a network
    health check — this is read synchronously on every state push (see
    hostState() in server.js) — just whether a provider is pointed at all;
    a genuinely unreachable Ollama server (or a bad model name) still
    degrades through the exact same per-call fallback every other failure
    already does, it just won't show as "Not configured" ahead of time. */
function status() {
  if (provider() === 'ollama') return { configured: true, provider: 'ollama', model: ollamaModel() };
  return { configured: !!process.env.ANTHROPIC_API_KEY, provider: 'anthropic', model: ANTHROPIC_MODEL };
}

module.exports = { askStoryteller, status, MODEL: ANTHROPIC_MODEL };
