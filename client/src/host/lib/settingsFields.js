// Storyteller-whim knobs (Bucket 1 in ABILITY_PATTERNS.md) — the help text
// is each key's own inline comment in engine.js's newGame(), copied here so
// the two can't quietly drift apart.
export const CHANCE_FIELDS = [
  { key: 'mayorRedirectChance', label: 'Mayor redirect', help: '"might" redirect a night kill onto the Mayor instead' },
  { key: 'shabalothRegurgitateChance', label: 'Shabaloth regurgitate', help: '"might" bring back last night’s kill' },
  { key: 'pacifistSaveChance', label: 'Pacifist save', help: '"might" save an executed good player' },
  { key: 'tinkerDeathChance', label: 'Tinker death', help: '"might die at any time" — rolled once per night' },
  { key: 'madExecutionChance', label: 'Madness execution', help: 'Mutant/Cerenovus: "might be executed" for not acting mad enough' },
  { key: 'recluseRegistersEvil', label: 'Recluse / Spy registration', help: 'how often a Recluse or Spy misregisters as the wrong team' },
];

export const SECONDS_FIELDS = [
  { key: 'windowSeconds', label: 'Night window (seconds)' },
  { key: 'wave2Seconds', label: 'Second-wave window (seconds)' },
  { key: 'voteWindowSeconds', label: 'Vote window (seconds)' },
];
