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

  it('Close calls onClose', async () => {
    const onClose = vi.fn();
    render(<PowerLogOverlay players={players} actionLog={actionLog} nightNumber={1} onClose={onClose} />);
    await userEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
