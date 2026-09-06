'use strict';
// A thin, I/O-only wrapper around Anthropic's Messages API — the one place
// this app makes an outbound network call. Deliberately NOT required by
// game/engine.js (whose every export tools/simulate.js's ~2000 assertions
// call synchronously, with no mocking layer — that only works because
// engine.js touches neither the network nor process.env). Modeled on
// game/history.js: a game-adjacent module that isn't pure engine logic but
// isn't server.js either, required alongside E in server.js.
//
// No SDK dependency — this project has none, on purpose (see the v1.0
// showcase) — just Node's built-in global fetch (Node >=18, already this
// project's minimum) against the raw HTTP API. There is exactly one call
// shape needed here (a single-turn, non-streaming, short, schema-constrained
// reply), which is exactly the case where an SDK buys nothing an SDK would
// otherwise be carried around for.
//
// Used by server.js for Sects & Violets' Savant/Gossip/Artist — the three
// "Bucket 4" characters (see BUCKET4_IDS in helpers.js) whose ability
// reduces "ask/tell the Storyteller something open-ended" to a menu or
// template for lack of a real Storyteller. See game/ABILITY_PATTERNS.md for
// why free text was rejected there in the first place, and the note added
// there about what changes once a real judge (this) is in the loop.

const MODEL = 'claude-haiku-4-5-20251001'; // classification/rephrasing on a live table's critical path, not a reasoning task
const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * @param {object} opts
 * @param {string} opts.system - system prompt
 * @param {string} opts.prompt - the one user turn
 * @param {object} opts.schema - JSON schema the reply must conform to
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{ok:true, data:object} | {ok:false, reason:string}>}
 */
async function askStoryteller({ system, prompt, schema, maxTokens = 300, timeoutMs = 9000 }) {
  // Read fresh on every call, never cached at module load (unlike PORT in
  // server.js) — an operator can set or rotate the key between games without
  // this module having latched onto its absence at require time.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no-key' };

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey, // not Authorization: Bearer — that header form is OAuth-token-only
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
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

module.exports = { askStoryteller, MODEL };
