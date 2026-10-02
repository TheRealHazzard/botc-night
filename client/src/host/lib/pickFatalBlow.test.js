import { describe, it, expect } from 'vitest';
import { pickFatalBlow } from './pickFatalBlow.js';

describe('pickFatalBlow', () => {
  it('a Slayer shot beats every other category', () => {
    const state = { deaths: [{ name: 'Fay', cause: 'slayer' }], victory: { reason: 'Good wins.' } };
    expect(pickFatalBlow(state)).toEqual({ icon: 'crosshair', text: 'Fay falls.' });
  });

  it("the Evil Twin's twin executed is named as that specific twist", () => {
    const state = {
      deaths: [{ name: 'Cass', cause: 'execution' }],
      victory: { conditionId: 'evilTwinTwinExecuted', reason: "The Evil Twin's twin was executed." },
    };
    expect(pickFatalBlow(state)).toEqual({ icon: 'eye', text: "Cass was the Evil Twin's twin all along." });
  });

  it('matches on conditionId, not the (now variable) reason prose', () => {
    const state = {
      deaths: [{ name: 'Cass', cause: 'execution' }],
      victory: { conditionId: 'evilTwinTwinExecuted', reason: 'The good Twin fell, and doomed the town by it.' },
    };
    expect(pickFatalBlow(state).icon).toBe('eye');
  });

  it('the Vortox wins with no execution', () => {
    const state = { deaths: [], victory: { conditionId: 'vortoxNoExecution', reason: 'No one was executed, and the Vortox lives.' } };
    expect(pickFatalBlow(state)).toEqual({ icon: 'bolt', text: 'Every read was false. The Vortox wins.' });
  });

  it('a plain execution ends the game', () => {
    const state = { deaths: [{ name: 'Bo', cause: 'execution' }], victory: { reason: 'Evil wins.' } };
    expect(pickFatalBlow(state)).toEqual({ icon: 'scroll', text: 'Bo is executed.' });
  });

  it('a night kill ends the game', () => {
    const state = { deaths: [{ name: 'Ada', cause: 'demon' }], victory: { reason: 'Evil wins.' } };
    expect(pickFatalBlow(state)).toEqual({ icon: 'moon', text: 'The night claims Ada.' });
  });

  it('every recognized night-kill cause counts, not just "demon"', () => {
    for (const cause of ['minion', 'gossip', 'gambler', 'tinker', 'grandmother-link', 'fanggu-transform']) {
      const state = { deaths: [{ name: 'X', cause }], victory: { reason: 'Evil wins.' } };
      expect(pickFatalBlow(state).icon).toBe('moon');
    }
  });

  it('returns null when there is no single fresh moment to spotlight', () => {
    const state = { deaths: [], victory: null };
    expect(pickFatalBlow(state)).toBeNull();
  });

  it('a Slayer shot wins even when the game also ended on an Evil-Twin-style victory reason', () => {
    const state = {
      deaths: [{ name: 'Fay', cause: 'slayer' }],
      victory: { conditionId: 'evilTwinTwinExecuted', reason: "The Evil Twin's twin was executed." },
    };
    expect(pickFatalBlow(state).icon).toBe('crosshair');
  });

  it('once players (and so true characters) are known, the text is character-flavored, not the plain mechanical line', () => {
    const state = {
      deaths: [{ name: 'Bo', cause: 'execution' }],
      victory: { reason: 'Evil wins.' },
      players: [{ name: 'Bo', characterId: 'imp' }],
    };
    expect(pickFatalBlow(state)).toEqual({ icon: 'scroll', text: "Bo's evil dies with the body it wore." });
  });

  it('falls back to the plain mechanical line when the dead player cannot be matched in players[]', () => {
    const state = {
      deaths: [{ name: 'Bo', cause: 'execution' }],
      victory: { reason: 'Evil wins.' },
      players: [{ name: 'SomeoneElse', characterId: 'imp' }],
    };
    expect(pickFatalBlow(state)).toEqual({ icon: 'scroll', text: 'Bo is executed.' });
  });

  it("the Evil Twin's twin and Vortox endings stay as their own specific lines, not a character epitaph", () => {
    const state = {
      deaths: [{ name: 'Cass', cause: 'execution' }],
      victory: { conditionId: 'evilTwinTwinExecuted', reason: "The Evil Twin's twin was executed." },
      players: [{ name: 'Cass', characterId: 'imp' }],
    };
    expect(pickFatalBlow(state).text).toBe("Cass was the Evil Twin's twin all along.");
  });
});
