import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PowerLogOverlay from './PowerLogOverlay.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

const players = [
  { id: 'p1', name: 'Ada', characterId: 'soldier', character: 'Soldier' },
  { id: 'p2', name: 'Bo', characterId: 'imp', character: 'Imp' },
];
const actionLog = [
  { night: 1, phase: 'night', playerId: 'p1', targets: ['Bo'] },
  { night: 2, phase: 'day', playerId: 'p1', targets: ['Bo'] },
];

describe('PowerLogOverlay', () => {
  beforeEach(() => mockFetch({ '/api/tokens': { soldier: '/tokens/soldier.png', imp: '/tokens/imp.png' } }));

  it('has 1 header row + one row per player, and 1 + nightNumber*2 columns', () => {
    render(<PowerLogOverlay players={players} actionLog={actionLog} nightNumber={3} onClose={() => {}} />);
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 players
    expect(within(rows[0]).getAllByRole('columnheader')).toHaveLength(1 + 3 * 2);
  });

  it("Ada's role cell shows her token and label", () => {
    const { container } = render(<PowerLogOverlay players={players} actionLog={actionLog} nightNumber={1} onClose={() => {}} />);
    expect(screen.getByText('Soldier')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(container.querySelector('img.powerlog-token')).toHaveAttribute('src', '/tokens/soldier.png');
  });

  it("Ada's night-1 cell shows a target chip with Bo's token and name", () => {
    render(<PowerLogOverlay players={players} actionLog={actionLog} nightNumber={1} onClose={() => {}} />);
    const chip = document.querySelector('.powerlog-target');
    expect(chip).toBeTruthy();
    expect(within(chip).getByText('Bo')).toBeInTheDocument();
    expect(chip.querySelector('img')).toHaveAttribute('src', '/tokens/imp.png');
  });

  it("Ada's day-1 cell is a blank dash (her only day entry was day 2)", () => {
    render(<PowerLogOverlay players={players} actionLog={actionLog} nightNumber={2} onClose={() => {}} />);
    const table = screen.getByRole('table');
    const adaRow = within(table).getAllByRole('row')[1];
    const day1Cell = within(adaRow).getAllByRole('cell')[2]; // role, night1, day1, night2, day2
    expect(day1Cell).toHaveTextContent('—');
    expect(day1Cell).toHaveClass('empty');
  });

  it('a target name shared by two seats (older data, pre-dating /api/join\'s uniqueness check) falls back to no token rather than picking either one', () => {
    const dupPlayers = [
      { id: 'p1', name: 'Ada', characterId: 'soldier', character: 'Soldier' },
      { id: 'p2', name: 'Sam', characterId: 'imp', character: 'Imp' },
      { id: 'p3', name: 'Sam', characterId: 'poisoner', character: 'Poisoner' },
    ];
    const dupLog = [{ night: 1, phase: 'night', playerId: 'p1', targets: ['Sam'] }];
    render(<PowerLogOverlay players={dupPlayers} actionLog={dupLog} nightNumber={1} onClose={() => {}} />);
    const chip = document.querySelector('.powerlog-target');
    expect(within(chip).getByText('Sam')).toBeInTheDocument();
    expect(chip.querySelector('img')).toBeNull();
    expect(chip.querySelector('.powerlog-target-token-fallback')).toBeTruthy();
  });

  it('Close calls onClose', async () => {
    const onClose = vi.fn();
    render(<PowerLogOverlay players={players} actionLog={actionLog} nightNumber={1} onClose={onClose} />);
    await userEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('omits "Information received" entirely when there is no resultsLog', () => {
    render(<PowerLogOverlay players={players} actionLog={actionLog} nightNumber={1} onClose={() => {}} />);
    expect(screen.queryByText('Information received')).not.toBeInTheDocument();
  });

  it('groups resultsLog entries by night, showing who/character/title/body — the actual fix for a result that never rendered live', () => {
    const resultsLog = [
      { night: 1, playerId: 'p1', playerName: 'Ada', characterId: 'soldier', characterName: 'Soldier', title: 'Empath', body: 'Evil living neighbours: 1' },
      { night: 2, playerId: 'p2', playerName: 'Bo', characterId: 'imp', characterName: 'Ravenkeeper', title: 'Ravenkeeper', body: 'Ada is the Soldier.' },
    ];
    const { container } = render(<PowerLogOverlay players={players} actionLog={actionLog} resultsLog={resultsLog} nightNumber={2} onClose={() => {}} />);
    const infoSection = container.querySelector('.powerlog-info');
    expect(within(infoSection).getByText('Information received')).toBeInTheDocument();
    expect(within(infoSection).getByText('Night 1')).toBeInTheDocument();
    expect(within(infoSection).getByText('Night 2')).toBeInTheDocument();
    expect(within(infoSection).getByText('Ada — Soldier')).toBeInTheDocument();
    expect(within(infoSection).getByText('Empath: Evil living neighbours: 1')).toBeInTheDocument();
    expect(within(infoSection).getByText('Bo — Ravenkeeper')).toBeInTheDocument();
    expect(within(infoSection).getByText('Ravenkeeper: Ada is the Soldier.')).toBeInTheDocument();
  });
});
