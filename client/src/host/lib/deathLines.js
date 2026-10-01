// Character-aware flavor for the single death pickFatalBlow.js spotlights —
// never used anywhere a character could still be a live secret. The fatal
// blow only ever fires once game.phase is 'over' and every true character
// is already revealed (see pickFatalBlow.js's own caller, useFatalBlowSequencer),
// the same moment OverView's full roster already shows everyone's role — so
// naming a character here leaks nothing a player can't already see on screen.
//
// Deliberately a starting set, not exhaustive — same shape as
// game/characterNotes.js's CHARACTER_NOTES: covers Trouble Brewing, Bad Moon
// Rising, and Sects & Violets (the three playable editions) by id, with a
// generic rotating pool as the fallback for anything else (a custom/homebrew
// character, or one not written yet). Extend DEATH_LINES the same way
// CHARACTER_NOTES grows — one more entry, no other wiring needed.
const DEATH_LINES = {
  // Trouble Brewing
  washerwoman: "{name}'s information outlives them.",
  librarian: '{name} closes the book early.',
  investigator: "{name}'s hunch goes unproven.",
  chef: '{name} stops counting pairs.',
  empath: '{name} feels nothing now.',
  fortuneteller: '{name} never saw this one coming.',
  undertaker: '{name} joins the list they kept.',
  monk: "{name} couldn't protect themself.",
  ravenkeeper: "{name}'s eyes close for good, with no choice left to make.",
  virgin: "{name}'s first nomination was also their last.",
  slayer: "{name}'s one shot stays in the chamber.",
  soldier: "Not even {name}'s Soldier survives everything.",
  mayor: "{name}'s quiet redirection runs out.",
  butler: '{name} follows no one anywhere now.',
  drunk: '{name} never even knew what they were.',
  recluse: '{name} registers as gone, same as always.',
  saint: "{name}'s own mistake, forgiven too late.",
  poisoner: "{name}'s last dose goes to waste.",
  spy: '{name} stops reading the grimoire upside down.',
  scarletwoman: '{name} never got their promotion.',
  baron: "{name}'s extra Outsiders outlive them.",
  imp: "{name}'s evil dies with the body it wore.",

  // Bad Moon Rising
  grandmother: "{name}'s grandchild is on their own now.",
  sailor: '{name} stops drinking for the night, permanently.',
  chambermaid: '{name} stops watching the hallway.',
  exorcist: "{name}'s warding ends.",
  innkeeper: '{name} serves their last round.',
  gambler: "{name}'s last bet doesn't pay out.",
  gossip: "{name}'s rumor outlives them.",
  courtier: "{name}'s week-long curse goes unfinished.",
  professor: "{name}'s one resurrection goes untaught.",
  minstrel: '{name} stops the music.',
  tealady: "{name}'s neighbours are on their own now.",
  pacifist: "{name}'s mercy runs out, for themself this time.",
  fool: "{name}'s last trick stays hidden.",
  tinker: "{name}'s luck finally ran out.",
  moonchild: "{name}'s one curse remains unclaimed.",
  goon: "{name}'s loyalty stops mattering.",
  lunatic: '{name} never was the Demon. Shame.',
  godfather: "{name}'s grudges die with them.",
  devilsadvocate: "{name}'s next save never comes.",
  assassin: "{name}'s one shot stays unfired.",
  mastermind: "{name}'s extra day runs out early.",
  zombuul: '{name} stops pretending to be dead.',
  pukka: "{name}'s poison dies with them.",
  shabaloth: '{name} stops coming back for seconds.',
  po: "{name}'s held breath finally lets go.",

  // Sects & Violets
  clockmaker: "{name}'s countdown reaches zero.",
  dreamer: '{name} stops dreaming up villains.',
  snakecharmer: "{name}'s last swap goes unmade.",
  mathematician: '{name} stops counting the abnormal.',
  flowergirl: '{name} stops checking who left the brothel.',
  towncrier: "{name}'s bell rings no more.",
  oracle: "{name}'s sight goes dark.",
  savant: "{name}'s last two facts go untold.",
  seamstress: "{name}'s thread runs out.",
  philosopher: "{name}'s borrowed ability dies with them.",
  artist: "{name}'s last question goes unasked.",
  juggler: "{name}'s last guess goes unmade.",
  sage: '{name} never learns who did this.',
  mutant: "{name}'s madness finally quiets.",
  sweetheart: "{name}'s drunken charm fades from the room.",
  barber: "{name}'s swap, if it ever came, is done now.",
  klutz: "{name}'s choice, for once, doesn't matter anymore.",
  eviltwin: "{name}'s twin is on their own now.",
  witch: "{name}'s curse outlives them.",
  cerenovus: "{name}'s madness outlives them.",
  pithag: "{name}'s transformations end.",
  fanggu: "{name}'s claim on this town ends.",
  vigormortis: "{name}'s poison dies with them, mostly.",
  nodashii: "{name}'s poison goes quiet.",
  vortox: "{name}'s false world ends with them.",
};

const GENERIC_DEATH_LINES = [
  "{name}'s part in this is over.",
  '{name} has nothing left to give this town.',
  'Whatever {name} knew, it dies with them.',
];

/** The dead player's own name woven into a line for their true character —
    specific if DEATH_LINES has one, otherwise a generic line from the
    rotating pool. Only ever called once a character is safe to name (see
    this file's own header) — returns null only when there's no character
    to speak of at all (characterId falsy), so the caller can fall back to
    its own plain mechanical text. */
export function deathLineFor(characterId, name) {
  if (!characterId || !name) return null;
  const template = DEATH_LINES[characterId]
    || GENERIC_DEATH_LINES[Math.floor(Math.random() * GENERIC_DEATH_LINES.length)];
  return template.replace('{name}', name);
}
