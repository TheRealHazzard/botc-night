'use strict';
// Every LLM decision function this app makes, in one place — see
// ROADMAP.md's "three-mode rollout" section, Phase 2. Flat re-export of
// the individual modules below; server.js requires this file alone
// (`const S = require('./game/storyteller')`) rather than each submodule
// separately, same convention game/abilities/index.js established for the
// character registry.
//
// Every decision function here takes `callLLM` as its last parameter
// instead of reaching for a module-level singleton — see shared.js's own
// comment for why. server.js wires in its real llmCall once at startup;
// a test wires in a plain stub, no server boot, no mocked fetch required.

module.exports = {
  ...require('./whimJudge'),
  ...require('./claimJudge'),
  ...require('./botBehavior'),
  ...require('./rephrase'),
  ...require('./askStoryteller'),
};
