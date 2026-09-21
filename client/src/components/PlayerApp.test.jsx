import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlayerApp from './PlayerApp.jsx';
import { mockFetch, lastBody } from '../../test/fetchMock.js';

function baseP(overrides = {}) {
  return {
    phase: 'day',
    you: { name: 'Bo', alive: true, ghostVoteUsed: false, character: { id: 'imp', name: 'Imp', team: 'demon', ability: 'Kill.' }, color: null },
    watching: false,
    nightNumber: 1,
    wave: 0,
    prompt: null,
    result: null,
    moonchildChoice: null,
    klutzChoice: null,
    madClaim: null,
    canNominate: null,
    slayerShot: null,
    damselGuess: null,
    gossipClaim: null,
    jugglerGuess: null,
    savantVisit: null,
    artistQuestion: null,
    voteRequest: null,
    llmEnabled: false,
    ...overrides,
  };
}

describe('PlayerApp', () => {
  beforeEach(() => mockFetch({ '/api/tokens': {} }));

  it('shows the role card when nothing is actively being chosen', () => {
    render(<PlayerApp P={baseP()} token="tok" />);
    expect(screen.getByText(/hold to see who you are/i)).toBeInTheDocument();
  });

  it('hides the role card while a night prompt is open and unsubmitted', () => {
    const P = baseP({ phase: 'night', prompt: { text: 'Choose.', count: 1, targets: [], guessCharacter: false, optional: false }, submitted: false });
    render(<PlayerApp P={P} token="tok" />);
    expect(screen.queryByText(/hold to see who you are/i)).not.toBeInTheDocument();
    expect(screen.getByText('Choose.')).toBeInTheDocument();
  });

  it('shows the role card again once a night prompt is submitted', () => {
    const P = baseP({ phase: 'night', prompt: { text: 'Choose.', count: 1, targets: [], guessCharacter: false, optional: false }, submitted: true });
    render(<PlayerApp P={P} token="tok" />);
    expect(screen.getByText(/hold to see who you are/i)).toBeInTheDocument();
    expect(screen.getByText('Answered.')).toBeInTheDocument();
  });

  it('hides the role card during any of the day-phase single-choice prompts', () => {
    for (const key of ['slayerShot', 'damselGuess', 'moonchildChoice', 'klutzChoice', 'madClaim']) {
      const P = baseP({ [key]: key === 'madClaim' ? { label: 'the Drunk' } : { targets: [] } });
      const { unmount } = render(<PlayerApp P={P} token="tok" />);
      expect(screen.queryByText(/hold to see who you are/i)).not.toBeInTheDocument();
      unmount();
    }
  });

  it('shows the watching banner and dead banner independently of the main card', () => {
    const P = baseP({ watching: true, you: { ...baseP().you, alive: false, ghostVoteUsed: true } });
    render(<PlayerApp P={P} token="tok" />);
    expect(screen.getByText(/watching a simulation as bo/i)).toBeInTheDocument();
    expect(screen.getByText(/your vote is spent/i)).toBeInTheDocument();
  });

  it('hides the Storyteller-controls banner for a non-leader', () => {
    render(<PlayerApp P={baseP({ isLeader: false })} token="tok" />);
    expect(screen.queryByText('Storyteller controls')).not.toBeInTheDocument();
  });

  it('shows the Storyteller-controls banner for the leader and calls onOpenLeaderControls', async () => {
    const onOpenLeaderControls = vi.fn();
    render(<PlayerApp P={baseP({ isLeader: true })} token="tok" onOpenLeaderControls={onOpenLeaderControls} />);
    await userEvent.click(screen.getByText('Storyteller controls'));
    expect(onOpenLeaderControls).toHaveBeenCalledTimes(1);
  });

  it('hides Speak to the Storyteller when the LLM is off', () => {
    render(<PlayerApp P={baseP({ llmEnabled: false })} token="tok" />);
    expect(screen.queryByText('Speak to the Storyteller')).not.toBeInTheDocument();
  });

  it('shows Speak to the Storyteller during the day once the LLM is on', () => {
    render(<PlayerApp P={baseP({ llmEnabled: true })} token="tok" />);
    expect(screen.getByText('Speak to the Storyteller')).toBeInTheDocument();
  });

  it('hides Speak to the Storyteller outside the day phase, even with the LLM on', () => {
    render(<PlayerApp P={baseP({ llmEnabled: true, phase: 'night', prompt: null })} token="tok" />);
    expect(screen.queryByText('Speak to the Storyteller')).not.toBeInTheDocument();
  });

  it('an unspent death shows the "still have a voice" copy instead', () => {
    const P = baseP({ you: { ...baseP().you, alive: false, ghostVoteUsed: false } });
    render(<PlayerApp P={P} token="tok" />);
    expect(screen.getByText(/one vote left/i)).toBeInTheDocument();
  });

  it('threads onChangeUser down to the lobby card\'s Change button', async () => {
    const onChangeUser = vi.fn();
    render(<PlayerApp P={baseP({ phase: 'lobby' })} token="tok" onChangeUser={onChangeUser} />);
    await userEvent.click(screen.getByText('Change'));
    expect(onChangeUser).toHaveBeenCalledTimes(1);
  });

  it('lobby/reveal/night-waiting/daylight phases render their matching plain card', () => {
    const cases = [
      [{ phase: 'lobby' }, /seated as bo/i],
      [{ phase: 'reveal' }, /learn yourself/i],
      [{ phase: 'night', prompt: null, you: { ...baseP().you } }, /eyes closed/i],
      [{ phase: 'day' }, /daylight/i],
    ];
    for (const [override, expected] of cases) {
      const { unmount } = render(<PlayerApp P={baseP(override)} token="tok" />);
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it('an active vote (from P.voteRequest) takes over instead of the plain daylight card', () => {
    const P = baseP({ voteRequest: { nominationId: 'n1', nomineeName: 'Cy', windowEndsAt: Date.now() + 20000, isGhostVote: false } });
    render(<PlayerApp P={P} token="tok" />);
    expect(screen.getByText('Vote: Cy')).toBeInTheDocument();
    expect(screen.queryByText(/daylight/i)).not.toBeInTheDocument();
  });

  it('a result renders alongside whatever the main day/night card is', () => {
    const P = baseP({ result: { title: 'Learned', body: 'Something.', names: [] } });
    render(<PlayerApp P={P} token="tok" />);
    expect(screen.getByText(/hold to read what you were told/i)).toBeInTheDocument();
    expect(screen.getByText(/daylight/i)).toBeInTheDocument();
  });

  it('day-phase special prompts take priority over the plain daylight card, in the right shape', () => {
    const P = baseP({ gossipClaim: { targets: [], characterOptions: [] } });
    render(<PlayerApp P={P} token="tok" />);
    expect(screen.getByText('Make a statement')).toBeInTheDocument();
    expect(screen.queryByText(/^daylight$/i)).not.toBeInTheDocument();
  });

  it('shows "I Nominate" during plain daylight when canNominate is set, and not otherwise', () => {
    const { rerender } = render(<PlayerApp P={baseP()} token="tok" />);
    expect(screen.queryByText('I Nominate')).not.toBeInTheDocument();
    rerender(<PlayerApp P={baseP({ canNominate: { targets: [{ id: 'p2', name: 'Cy', color: null, alive: true }] } })} token="tok" />);
    expect(screen.getByText('I Nominate')).toBeInTheDocument();
  });

  it('tapping I Nominate swaps in the target picker, hiding the role card, and posts {token, targetId} on confirm', async () => {
    const fetchMock = mockFetch({ '/api/tokens': {}, '/api/table/nominate': {} });
    const P = baseP({ canNominate: { targets: [{ id: 'p2', name: 'Cy', color: null, alive: true }] } });
    render(<PlayerApp P={P} token="tok" />);

    await userEvent.click(screen.getByText('I Nominate'));
    expect(screen.queryByText(/hold to see who you are/i)).not.toBeInTheDocument();
    expect(screen.getByText('Nominate', { selector: 'h2' })).toBeInTheDocument();

    await userEvent.click(screen.getByText('Cy'));
    await userEvent.click(screen.getByText('Nominate', { selector: 'button' }));
    expect(lastBody(fetchMock, '/api/table/nominate')).toEqual({ token: 'tok', targetId: 'p2' });
  });

  it('a living Minion\'s damselGuess prompt renders and posts {token, targetId} on confirm', async () => {
    const fetchMock = mockFetch({ '/api/tokens': {}, '/api/damsel-guess': { correct: false } });
    const P = baseP({ damselGuess: { targets: [{ id: 'p2', name: 'Cy', color: null, alive: true }] } });
    render(<PlayerApp P={P} token="tok" />);

    expect(screen.getByText('Guess the Damsel')).toBeInTheDocument();
    expect(screen.queryByText(/hold to see who you are/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Cy'));
    await userEvent.click(screen.getByText('Guess'));
    expect(lastBody(fetchMock, '/api/damsel-guess')).toEqual({ token: 'tok', targetId: 'p2' });
  });

  it('canNominate disappearing (someone else\'s nomination opened) resets the in-progress picker', () => {
    const withNominate = baseP({ canNominate: { targets: [{ id: 'p2', name: 'Cy', color: null, alive: true }] } });
    const { rerender } = render(<PlayerApp P={withNominate} token="tok" />);
    // Without simulating the click (a full rerender-away covers the effect
    // path either way): once canNominate goes null, plain daylight is back.
    rerender(<PlayerApp P={baseP({ canNominate: null })} token="tok" />);
    expect(screen.getByText(/daylight/i)).toBeInTheDocument();
    expect(screen.queryByText('Nominate')).not.toBeInTheDocument();
  });
});
