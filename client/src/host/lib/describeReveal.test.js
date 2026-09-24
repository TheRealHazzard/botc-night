import { describe, it, expect } from 'vitest';
import { describePlayOfTheGame, describeMvp, describeGameWinningNomination } from './describeReveal.js';

describe('describePlayOfTheGame', () => {
  it('a poisoned Slayer shot on the real Demon reads as the counterfactual it is', () => {
    const event = { type: 'slayer-attempt', impaired: true, targetWasDemon: true };
    expect(describePlayOfTheGame(event, { playerName: 'Fay', targetName: 'Cass' })).toEqual({
      icon: 'crosshair',
      title: 'Play of the Game',
      subtitle: 'Fay',
      body: 'Fay was poisoned — and still put a bolt through the Demon.',
    });
  });

  it('an unimpaired Slayer shot reads differently from a poisoned one', () => {
    const event = { type: 'slayer-attempt', impaired: false, targetWasDemon: true };
    expect(describePlayOfTheGame(event, { playerName: 'Fay', targetName: 'Cass' }).body)
      .toBe('Fay took the shot, and it was the Demon all along.');
  });

  it('a Monk-style block names both the survivor and whoever protected them', () => {
    const event = { type: 'blocked-kill', reason: 'protected' };
    expect(describePlayOfTheGame(event, { playerName: 'Mo', targetName: 'Cass' }).body)
      .toBe("Cass should have died tonight — Mo made sure they didn't.");
  });

  it('a self-preservation block (e.g. Soldier) has no separate credited player to name', () => {
    const event = { type: 'blocked-kill', reason: 'soldier' };
    expect(describePlayOfTheGame(event, { playerName: 'Cass', targetName: 'Cass' }).body)
      .toBe("Cass took a Demon's attack meant to kill them, and walked away.");
  });

  it('an unrecognized blocked-kill reason still renders something, not undefined', () => {
    const event = { type: 'blocked-kill', reason: 'not-a-real-reason' };
    expect(describePlayOfTheGame(event, { playerName: 'X', targetName: 'Cass' }).body)
      .toBe('Cass survived a kill that should have landed.');
  });

  it('a nullified vote names both the voter and who it would have sent to the block', () => {
    const event = { type: 'vote-nullified' };
    expect(describePlayOfTheGame(event, { playerName: 'Butler', targetName: 'Imp' }).body)
      .toBe("Butler's vote didn't count — and it would have sent Imp to the block.");
  });

  it('a goon flip names the chooser, not the Goon themselves', () => {
    const event = { type: 'goon-flip' };
    expect(describePlayOfTheGame(event, { playerName: 'Imp', targetName: 'Goon' }).body)
      .toBe('Imp turned the Goon evil without either of them choosing it.');
  });

  it('a mayor redirect stays deliberately anonymous — decisionLog never records who else was in the pool', () => {
    const event = { type: 'mayor-redirect' };
    expect(describePlayOfTheGame(event, { playerName: 'Mayor' }).body)
      .toBe("A quiet redirect kept someone alive who wasn't supposed to be.");
  });

  it('a close nomination names both the nominator and the nominee', () => {
    const event = { type: 'nomination' };
    expect(describePlayOfTheGame(event, { playerName: 'Chef', targetName: 'Soldier' }).body)
      .toBe('Chef\'s nomination of Soldier came down to the wire.');
  });
});

describe('describeMvp', () => {
  it('leads with the MVP\'s own top moment, using the same per-type wording as Play of the Game', () => {
    const mvp = { playerId: 'slayer1', score: 1.0, topEvent: { type: 'slayer-attempt', impaired: true, targetWasDemon: true } };
    const result = describeMvp(
      mvp,
      { playerName: 'Fay', characterName: 'Slayer' },
      { playerName: 'Fay', targetName: 'Cass' },
    );
    expect(result.icon).toBe('trophy');
    expect(result.title).toBe('MVP');
    expect(result.subtitle).toBe('Fay — Slayer');
    expect(result.body).toBe('Fay was poisoned — and still put a bolt through the Demon.');
  });

  it('falls back to a generic line when there is no topEvent at all', () => {
    const mvp = { playerId: 'p1', score: 0, topEvent: null };
    const result = describeMvp(mvp, { playerName: 'Ada', characterName: null }, {});
    expect(result.subtitle).toBe('Ada');
    expect(result.body).toBe('Ada shaped this game more than anyone else on the winning side.');
  });
});

describe('describeGameWinningNomination', () => {
  it('names the nominator, the nominee, and the night it happened', () => {
    const nom = { night: 3 };
    const result = describeGameWinningNomination(nom, { nominatorName: 'Soldier', nomineeName: 'Imp' });
    expect(result).toEqual({
      icon: 'hand',
      title: 'The nomination that ended it',
      subtitle: 'Soldier → Imp',
      body: 'Imp was executed on night 3 — the nomination that decided the game.',
    });
  });
});
