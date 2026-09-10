import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DayView from './DayView.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

const players = [
  { id: 'p1', name: 'Ada', alive: true, connected: true, ghostVoteUsed: false, color: null },
  { id: 'p2', name: 'Bo', alive: false, connected: true, ghostVoteUsed: false, color: null },
];
const activeScriptMeta = { id: 'tb', name: 'Trouble Brewing', difficulty: 1, description: 'x', decidedGames: 0 };
const config = { voteWindowSeconds: 20 };

describe('DayView', () => {
  beforeEach(() => mockFetch({ '/api/tokens': {}, '/trivia.json': [] }));

  it('shows the death narration for last night, with a skull', () => {
    const { container } = render(
      <DayView players={players} nightNumber={2} deaths={[{ night: 2, name: 'Bo', cause: 'demon' }]} mastermindExtraDay={false} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(screen.getByText('Bo did not wake.')).toBeInTheDocument();
    expect(container.querySelector('.deaths svg.icon')).toBeTruthy();
  });

  it('a night with nobody killed shows the "should worry you" line, no skull', () => {
    const { container } = render(
      <DayView players={players} nightNumber={1} deaths={[]} mastermindExtraDay={false} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(screen.getByText('Everyone wakes. That should worry you.')).toBeInTheDocument();
    expect(container.querySelector('.deaths svg.icon')).toBeFalsy();
  });

  it('shows the Mastermind hint only when mastermindExtraDay is true', () => {
    const { rerender } = render(
      <DayView players={players} nightNumber={1} deaths={[]} mastermindExtraDay={false} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(screen.queryByText(/mastermind's power lingers/i)).not.toBeInTheDocument();

    rerender(<DayView players={players} nightNumber={1} deaths={[]} mastermindExtraDay nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    expect(screen.getByText(/mastermind's power lingers/i)).toBeInTheDocument();
  });

  it('Kick Player/Night falls are disabled while a vote is open', () => {
    const openNom = { day: 1, nominatorName: 'Ada', nomineeName: 'Bo', closed: false, windowEndsAt: Date.now() + 20000, votes: [] };
    render(
      <DayView players={players} nightNumber={1} deaths={[]} mastermindExtraDay={false} nominations={[openNom]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(screen.getByText(/kick player/i)).toBeDisabled();
    expect(screen.getByText(/^night falls$/i)).toBeDisabled();
  });

  it('the execute select lists only living players', () => {
    render(
      <DayView players={players} nightNumber={1} deaths={[]} mastermindExtraDay={false} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    const select = screen.getByText('No execution').closest('select');
    expect(select.querySelectorAll('option')).toHaveLength(2); // "No execution" + Ada only
  });

  it('the execute select auto-populates with the qualifying nomination\'s leading nominee', () => {
    const closedNom = { day: 1, nominatorName: 'Bo', nomineeName: 'Ada', nomineeId: 'p1', closed: true, yesCount: 1, votes: [] };
    render(
      <DayView players={players} nightNumber={1} deaths={[]} mastermindExtraDay={false} nominations={[closedNom]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    const select = screen.getByText('No execution').closest('select');
    expect(select.value).toBe('p1');
  });

  it('a manual pick in the select overrides the auto-populated leader', async () => {
    const closedNom = { day: 1, nominatorName: 'Bo', nomineeName: 'Ada', nomineeId: 'p1', closed: true, yesCount: 1, votes: [] };
    render(
      <DayView players={players} nightNumber={1} deaths={[]} mastermindExtraDay={false} nominations={[closedNom]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    const select = screen.getByText('No execution').closest('select');
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
      <DayView players={threeAlive} nightNumber={1} deaths={[]} mastermindExtraDay={false} nominations={[]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    const kickButton = () => screen.getByText(/kick player/i).closest('button');
    expect(kickButton()).not.toHaveClass('leader-changed');

    const nomP1 = { day: 1, nominatorName: 'Cy', nomineeName: 'Ada', nomineeId: 'p1', closed: true, yesCount: 2, votes: [] };
    rerender(
      <DayView players={threeAlive} nightNumber={1} deaths={[]} mastermindExtraDay={false} nominations={[nomP1]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(kickButton()).toHaveClass('leader-changed');
  });

  it('does not flash a leader change once the host has manually overridden the pick', async () => {
    const nomP1 = { day: 1, nominatorName: 'Cy', nomineeName: 'Ada', nomineeId: 'p1', closed: true, yesCount: 2, votes: [] };
    const { rerender } = render(
      <DayView players={threeAlive} nightNumber={1} deaths={[]} mastermindExtraDay={false} nominations={[nomP1]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    const select = screen.getByText('No execution').closest('select');
    await userEvent.selectOptions(select, 'p2');

    const nomP3 = { day: 1, nominatorName: 'Ada', nomineeName: 'Evy', nomineeId: 'p3', closed: true, yesCount: 3, votes: [] };
    rerender(
      <DayView players={threeAlive} nightNumber={1} deaths={[]} mastermindExtraDay={false} nominations={[nomP1, nomP3]} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(screen.getByText(/kick player/i).closest('button')).not.toHaveClass('leader-changed');
  });
});
