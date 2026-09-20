import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScriptBuilderOverlay from './ScriptBuilderOverlay.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';

const characters = [
  { id: 'washerwoman', name: 'Washerwoman', team: 'townsfolk' },
  { id: 'chef', name: 'Chef', team: 'townsfolk' },
  { id: 'butler', name: 'Butler', team: 'outsider' },
  { id: 'poisoner', name: 'Poisoner', team: 'minion' },
  { id: 'imp', name: 'Imp', team: 'demon' },
];
const setupTable = { '5': { townsfolk: 3, outsider: 0, minion: 1, demon: 1 } };

function baseMocks(overrides = {}) {
  return mockFetch({
    '/api/characters': characters,
    '/api/setup-table': setupTable,
    '/api/table/script': {},
    ...overrides,
  });
}

const selectAllFive = async () => {
  for (const name of ['Washerwoman', 'Chef', 'Butler', 'Poisoner', 'Imp']) {
    await userEvent.click(screen.getByText(name));
  }
};

describe('ScriptBuilderOverlay', () => {
  it('groups characters by team and shows the live balance readout against the wanted count', async () => {
    baseMocks();
    render(<ScriptBuilderOverlay playerCount={5} onClose={() => {}} onCommitted={() => {}} />);
    expect(await screen.findByText('Washerwoman')).toBeInTheDocument();
    expect(screen.getByText(/Townsfolk.*0 \/ 3/)).toBeInTheDocument();
    expect(screen.getByText(/Demons.*0 \/ 1/)).toBeInTheDocument();

    await userEvent.click(screen.getByText('Imp'));
    expect(screen.getByText(/Demons.*1 \/ 1/)).toBeInTheDocument();
  });

  it('without a player count yet, shows a plain "selected" count instead of a wanted comparison', async () => {
    baseMocks();
    render(<ScriptBuilderOverlay playerCount={0} onClose={() => {}} onCommitted={() => {}} />);
    expect(await screen.findByText(/Townsfolk.*0 selected/)).toBeInTheDocument();
  });

  it('disables committing under 5 characters', async () => {
    baseMocks();
    render(<ScriptBuilderOverlay playerCount={5} onClose={() => {}} onCommitted={() => {}} />);
    await screen.findByText('Washerwoman');

    const commitBtn = screen.getByText(/use this roster/i);
    expect(commitBtn).toBeDisabled();

    for (const name of ['Washerwoman', 'Chef', 'Butler', 'Poisoner']) {
      await userEvent.click(screen.getByText(name));
    }
    expect(commitBtn).toBeDisabled(); // 4 selected — still under 5

    await userEvent.click(screen.getByText('Imp')); // the 5th
    expect(commitBtn).toBeEnabled();
  });

  it('posts the selected ids as customRoster and calls onCommitted on success', async () => {
    const fetchMock = baseMocks();
    const onCommitted = vi.fn();
    render(<ScriptBuilderOverlay playerCount={5} onClose={() => {}} onCommitted={onCommitted} />);
    await screen.findByText('Washerwoman');
    await selectAllFive();

    await userEvent.click(screen.getByText(/use this roster/i));
    expect(lastBody(fetchMock, '/api/table/script').customRoster.sort()).toEqual(
      ['butler', 'chef', 'imp', 'poisoner', 'washerwoman']
    );
    expect(onCommitted).toHaveBeenCalledTimes(1);
  });

  it('shows the server error inline and does not call onCommitted on a rejected commit', async () => {
    baseMocks({ '/api/table/script': { error: 'A script needs at least one demon.' } });
    const onCommitted = vi.fn();
    render(<ScriptBuilderOverlay playerCount={5} onClose={() => {}} onCommitted={onCommitted} />);
    await screen.findByText('Washerwoman');
    await selectAllFive();

    await userEvent.click(screen.getByText(/use this roster/i));
    expect(await screen.findByText('A script needs at least one demon.')).toBeInTheDocument();
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it('Close calls onClose', async () => {
    baseMocks();
    const onClose = vi.fn();
    render(<ScriptBuilderOverlay playerCount={5} onClose={onClose} onCommitted={() => {}} />);
    await userEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
