import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DayView from './DayView.jsx';
import { mockFetch } from '../../../test/fetchMock.js';
import { installFakeAudioContext, resetAudioCalls } from '../../../test/fakeAudioContext.js';

const players = [
  { id: 'p1', name: 'Ada', alive: true, connected: true, ghostVoteUsed: false, color: null },
  { id: 'p2', name: 'Bo', alive: false, connected: true, ghostVoteUsed: false, color: null },
];
const activeScriptMeta = { id: 'tb', name: 'Trouble Brewing', difficulty: 1, description: 'x', decidedGames: 0 };
const config = { voteWindowSeconds: 20 };

// The execute select / Kick Player / Night falls now render twice: once
// plainly in the persistent right-side panel (visible immediately, no
// interaction needed), and again inside ControlsDrawer, still closed by
// default for a phone driving this screen via the leader overlay. Most
// tests below just want the always-visible copy — getAllByText(...)[0]
// picks it (DOM order: the persistent panel renders before the drawer).
// openDrawer is only needed by tests specifically about drawer behavior.
const openDrawer = () => userEvent.click(screen.getByRole('button', { name: 'Storyteller controls' }));

describe('DayView', () => {
  beforeEach(() => {
    mockFetch({ '/api/tokens': {}, '/trivia.json': [] });
    installFakeAudioContext();
    resetAudioCalls();
  });

  it('shows the death narration for last night, with a skull', () => {
    const { container } = render(
      <DayView players={players} nightNumber={2} deaths={[{ night: 2, name: 'Bo', cause: 'demon' }]} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(screen.getByText('Bo did not wake.')).toBeInTheDocument();
    expect(container.querySelector('.deaths svg.icon')).toBeTruthy();
  });

  it('a night with nobody killed shows the "should worry you" line, no skull', () => {
    const { container } = render(
      <DayView players={players} nightNumber={1} deaths={[]} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(screen.getByText('Everyone wakes. That should worry you.')).toBeInTheDocument();
    expect(container.querySelector('.deaths svg.icon')).toBeFalsy();
  });

  // The wiki is explicit: "Add a shroud as normal. Do not say that the
  // Demon has died." DayView never even receives a mastermindExtraDay
  // prop any more — nothing here should announce or otherwise reveal it.
  it('never mentions the Mastermind, on any day', () => {
    render(
      <DayView players={players} nightNumber={1} deaths={[]} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(screen.queryByText(/mastermind/i)).not.toBeInTheDocument();
  });

  it('shows the controls plainly on the right; the drawer\'s own copy stays collapsed until tapped', () => {
    render(
      <DayView players={players} nightNumber={1} deaths={[]} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    // The persistent panel's copy is visible immediately — the whole point
    // of duplicating these controls — but the drawer's own copy underneath
    // hasn't been opened yet, so there's exactly one of each so far.
    expect(screen.getAllByText(/kick player/i)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Storyteller controls' })).toBeInTheDocument();
  });

  it('Kick Player/Night falls are disabled while a vote is open', () => {
    const openNom = { day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: false, windowEndsAt: Date.now() + 20000, votes: [] };
    render(
      <DayView players={players} nightNumber={1} deaths={[]} nominations={[openNom]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(screen.getAllByText(/kick player/i)[0]).toBeDisabled();
    expect(screen.getAllByText(/^night falls$/i)[0]).toBeDisabled();
  });

  it('the execute select lists only living players', () => {
    render(
      <DayView players={players} nightNumber={1} deaths={[]} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    const select = screen.getAllByText('No execution')[0].closest('select');
    expect(select.querySelectorAll('option')).toHaveLength(2); // "No execution" + Ada only
  });

  it('the execute select auto-populates with the qualifying nomination\'s leading nominee', () => {
    const closedNom = { day: 1, nominatorName: 'Bo', nomineeName: 'Ada', nomineeId: 'p1', closed: true, yesCount: 1, votes: [] };
    render(
      <DayView players={players} nightNumber={1} deaths={[]} nominations={[closedNom]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    const select = screen.getAllByText('No execution')[0].closest('select');
    expect(select.value).toBe('p1');
  });

  it('a manual pick in the select overrides the auto-populated leader', async () => {
    const closedNom = { day: 1, nominatorName: 'Bo', nomineeName: 'Ada', nomineeId: 'p1', closed: true, yesCount: 1, votes: [] };
    render(
      <DayView players={players} nightNumber={1} deaths={[]} nominations={[closedNom]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    const select = screen.getAllByText('No execution')[0].closest('select');
    await userEvent.selectOptions(select, '');
    expect(select.value).toBe('');
  });

  const threeAlive = [
    { id: 'p1', name: 'Ada', alive: true, connected: true, ghostVoteUsed: false, color: null },
    { id: 'p2', name: 'Cy', alive: true, connected: true, ghostVoteUsed: false, color: null },
    { id: 'p3', name: 'Evy', alive: true, connected: true, ghostVoteUsed: false, color: null },
  ];

  it('Kick Player flashes when the auto-populated leader changes to someone new', () => {
    const { rerender } = render(
      <DayView players={threeAlive} nightNumber={1} deaths={[]} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    const kickButton = () => screen.getAllByText(/kick player/i)[0].closest('button');
    expect(kickButton()).not.toHaveClass('leader-changed');

    const nomP1 = { day: 1, nominatorName: 'Cy', nomineeName: 'Ada', nomineeId: 'p1', closed: true, yesCount: 2, votes: [] };
    rerender(
      <DayView players={threeAlive} nightNumber={1} deaths={[]} nominations={[nomP1]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(kickButton()).toHaveClass('leader-changed');
  });

  it('does not flash a leader change once the host has manually overridden the pick', async () => {
    const nomP1 = { day: 1, nominatorName: 'Cy', nomineeName: 'Ada', nomineeId: 'p1', closed: true, yesCount: 2, votes: [] };
    const { rerender } = render(
      <DayView players={threeAlive} nightNumber={1} deaths={[]} nominations={[nomP1]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    const select = screen.getAllByText('No execution')[0].closest('select');
    await userEvent.selectOptions(select, 'p2');

    const nomP3 = { day: 1, nominatorName: 'Ada', nomineeName: 'Evy', nomineeId: 'p3', closed: true, yesCount: 3, votes: [] };
    rerender(
      <DayView players={threeAlive} nightNumber={1} deaths={[]} nominations={[nomP1, nomP3]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(screen.getAllByText(/kick player/i)[0].closest('button')).not.toHaveClass('leader-changed');
  });

  it('a manual execute override snaps back to the auto-computed leader if that player dies from an unrelated cause first', async () => {
    const nomP1 = { day: 1, nominatorName: 'Cy', nomineeName: 'Ada', nomineeId: 'p1', closed: true, yesCount: 2, votes: [] };
    const { rerender } = render(
      <DayView players={threeAlive} nightNumber={1} deaths={[]} nominations={[nomP1]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    const select = () => screen.getAllByText('No execution')[0].closest('select');
    await userEvent.selectOptions(select(), 'p2'); // manually override to Cy
    expect(select().value).toBe('p2');

    // Cy dies from an unrelated day-time cause (Virgin/Witch/Golem/Slayer) —
    // the stale override should fall back to following the leader again.
    const cyDead = threeAlive.map(p => (p.id === 'p2' ? { ...p, alive: false } : p));
    rerender(
      <DayView players={cyDead} nightNumber={1} deaths={[]} nominations={[nomP1]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(select().value).toBe('p1');
  });

  it('an explicit "No execution" choice is not disturbed by an unrelated player dying', async () => {
    const nomP1 = { day: 1, nominatorName: 'Cy', nomineeName: 'Ada', nomineeId: 'p1', closed: true, yesCount: 2, votes: [] };
    const { rerender } = render(
      <DayView players={threeAlive} nightNumber={1} deaths={[]} nominations={[nomP1]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    const select = () => screen.getAllByText('No execution')[0].closest('select');
    await userEvent.selectOptions(select(), '');
    expect(select().value).toBe('');

    const evyDead = threeAlive.map(p => (p.id === 'p3' ? { ...p, alive: false } : p));
    rerender(
      <DayView players={evyDead} nightNumber={1} deaths={[]} nominations={[nomP1]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(select().value).toBe('');
  });

  it('a fresh whim-roll log line shows the beat during the day too', () => {
    const { rerender } = render(
      <DayView players={players} nightNumber={1} deaths={[]} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} log={[]} />
    );
    expect(screen.queryByText('A quiet decision, unseen.')).not.toBeInTheDocument();

    const whimLog = [{ night: 1, phase: 'day', text: 'A quiet decision was made, unseen.', secret: false }];
    rerender(<DayView players={players} nightNumber={1} deaths={[]} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} log={whimLog} />);
    expect(screen.getByText('A quiet decision, unseen.')).toBeInTheDocument();
  });

  it('a fresh execution shows the minor-beat overlay; a pre-existing one on mount does not', () => {
    const { rerender } = render(
      <DayView players={players} nightNumber={1} deaths={[]} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(screen.queryByText('Ada is executed.')).not.toBeInTheDocument();

    rerender(
      <DayView players={players} nightNumber={1} deaths={[{ name: 'Ada', night: 1, cause: 'execution' }]} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(screen.getByText('Ada is executed.')).toBeInTheDocument();
  });

  it('a fresh night-kill death does not show the minor-beat overlay', () => {
    const { rerender } = render(
      <DayView players={players} nightNumber={1} deaths={[]} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    rerender(
      <DayView players={players} nightNumber={1} deaths={[{ name: 'Bo', night: 1, cause: 'demon' }]} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(screen.queryByText('Bo is executed.')).not.toBeInTheDocument();
  });

  it('the minor-beat overlay playing forces the drawer shut (the persistent panel is unaffected)', async () => {
    const { rerender } = render(
      <DayView players={players} nightNumber={1} deaths={[]} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    await openDrawer();
    // Two copies now — the persistent panel's and the newly-opened drawer's.
    expect(screen.getAllByText(/kick player/i)).toHaveLength(2);

    rerender(
      <DayView players={players} nightNumber={1} deaths={[{ name: 'Ada', night: 1, cause: 'execution' }]} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    // Only the persistent panel's copy remains — the drawer's own copy is forced shut.
    expect(screen.getAllByText(/kick player/i)).toHaveLength(1);
  });

  it('the auto-computed leader ignores a qualifying nominee who has since died', () => {
    const nomP1 = { day: 1, nominatorName: 'Cy', nomineeName: 'Ada', nomineeId: 'p1', closed: true, yesCount: 2, votes: [] };
    const adaDead = threeAlive.map(p => (p.id === 'p1' ? { ...p, alive: false } : p));
    render(
      <DayView players={adaDead} nightNumber={1} deaths={[]} nominations={[nomP1]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    const select = screen.getAllByText('No execution')[0].closest('select');
    expect(select.value).toBe('');
  });
});
