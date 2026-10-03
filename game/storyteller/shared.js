'use strict';
// Phase 2 of the three-mode rollout (see ROADMAP.md): every LLM decision
// function that used to live inline in server.js moves into this directory
// — same prompts, same schemas, same fallback behavior, just relocated.
//
// The one real design change, not just a move: every function here takes
// `callLLM` as an explicit parameter instead of reaching for server.js's
// own llmCall() (which closes over the module-level `game` singleton and
// pushes to the Observer SSE stream — both genuinely server-process
// concerns, not decision logic). server.js wires its real llmCall in once;
// a test wires in a plain stub returning canned {ok,data} — no mocked
// fetch, no server boot, no game/llmStoryteller.js involved at all. Same
// seam shape helpers.js's setWhimJudge(fn) already established at the
// engine.js/server.js boundary — this just extends it one layer further.

const { status } = require('../llmStoryteller');

// Whether a provider is actually configured right now — read fresh every
// call, same reasoning server.js's own llmConfigured() always used: an
// operator can set/rotate/switch providers between games without this
// caching a stale answer.
function isConfigured() {
  return status().configured;
}

module.exports = { isConfigured };
