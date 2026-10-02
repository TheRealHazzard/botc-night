import { describe, it, expect } from 'vitest';
import { deathLineFor } from './deathLines.js';

describe('deathLineFor', () => {
  it('returns null when there is no characterId or no name', () => {
    expect(deathLineFor(null, 'Ada')).toBeNull();
    expect(deathLineFor('imp', '')).toBeNull();
  });

  it('weaves the player name into a specific line for a known character', () => {
    expect(deathLineFor('imp', 'Ada')).toBe("Ada's evil dies with the body it wore.");
  });

  // The full Trouble Brewing / Bad Moon Rising / Sects & Violets roster
  // (team !== 'special'), confirmed directly against game/characters.json —
  // hardcoded rather than imported so this test stays a client-only,
  // self-contained check on deathLines.js's own coverage claim, not a
  // cross-package dependency on the engine's data loader.
  const TB_BMR_SV_IDS = [
    'washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller',
    'undertaker', 'monk', 'ravenkeeper', 'virgin', 'slayer', 'soldier', 'mayor',
    'butler', 'drunk', 'recluse', 'saint', 'poisoner', 'spy', 'scarletwoman', 'baron', 'imp',
    'grandmother', 'sailor', 'chambermaid', 'exorcist', 'innkeeper', 'gambler', 'gossip',
    'courtier', 'professor', 'minstrel', 'tealady', 'pacifist', 'fool', 'tinker', 'moonchild',
    'goon', 'lunatic', 'godfather', 'devilsadvocate', 'assassin', 'mastermind', 'zombuul',
    'pukka', 'shabaloth', 'po',
    'clockmaker', 'dreamer', 'snakecharmer', 'mathematician', 'flowergirl', 'towncrier',
    'oracle', 'savant', 'seamstress', 'philosopher', 'artist', 'juggler', 'sage', 'mutant',
    'sweetheart', 'barber', 'klutz', 'eviltwin', 'witch', 'cerenovus', 'pithag', 'fanggu',
    'vigormortis', 'nodashii', 'vortox',
  ];

  it('every Trouble Brewing, Bad Moon Rising, and Sects & Violets character has a specific line', () => {
    expect(TB_BMR_SV_IDS.length).toBe(72);
    for (const id of TB_BMR_SV_IDS) {
      const line = deathLineFor(id, 'Ada');
      expect(line, `missing a death line for ${id}`).not.toBeNull();
      expect(line, `${id}'s line never mentions the player's name`).toContain('Ada');
    }
  });

  it('falls back to a generic line (still naming the player) for an unknown character', () => {
    const line = deathLineFor('some-future-homebrew-id', 'Ada');
    expect(line).toContain('Ada');
  });
});
