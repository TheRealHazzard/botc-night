import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TheoryBuilderOverlay from './TheoryBuilderOverlay.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';
import { __resetScriptCacheForTests } from '../../hooks/useScript.js';

// Same module-scope cache concern ScriptOverlay.test.jsx already documents
// for useScript.js — reset before each test so they stay independent.
beforeEach(() => __resetScriptCacheForTests());

vi.mock('../TokenImage.jsx', () => ({
  default: ({ characterId, className }) => <div data-testid={`token-${characterId}`} className={className} />,
}));

const targets = [
  { id: 'p2', name: 'Bo', color: null, alive: true },
  { id: 'p3', name: 'Cy', color: null, alive: false },
];

function scriptData() {
  return {
    edition: 'tb',
    characters: [
      { id: 'imp', name: 'Imp', team: 'demon', ability: 'Kill.' },
      { id: 'chef', name: 'Chef', team: 'townsfolk', ability: 'Count.' },
    ],
  };
}

describe('TheoryBuilderOverlay', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<TheoryBuilderOverlay open={false} onClose={() => {}} targets={targets} script="tb" token="tok" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists every other player with "No guess yet", marks a dead one, and opens the character picker on tap', async () => {
    mockFetch({ '/api/script': scriptData() });
    render(<TheoryBuilderOverlay open onClose={() => {}} targets={targets} script="tb" token="tok" />);
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.getAllByText('No guess yet')).toHaveLength(2);

    await userEvent.click(screen.getByText('Bo'));
    expect(await screen.findByText('Bo is…')).toBeInTheDocument();
    expect(screen.getByText('Townsfolk (1)')).toBeInTheDocument();
    expect(screen.getByText('Demons (1)')).toBeInTheDocument();
  });

  it('picking a character assigns the guess and returns to the player list', async () => {
    mockFetch({ '/api/script': scriptData() });
    render(<TheoryBuilderOverlay open onClose={() => {}} targets={targets} script="tb" token="tok" />);
    await userEvent.click(screen.getByText('Bo'));
    await screen.findByText('Chef');
    await userEvent.click(screen.getByText('Chef'));

    expect(screen.getByText('Build a theory')).toBeInTheDocument(); // back on the player-list screen
    expect(screen.getByText('Chef')).toBeInTheDocument(); // now shown as Bo's guess
    expect(screen.getAllByText('No guess yet')).toHaveLength(1); // only Cy left unguessed
  });

  it('"Clear this guess" removes a guess already made for that player', async () => {
    mockFetch({ '/api/script': scriptData() });
    render(<TheoryBuilderOverlay open onClose={() => {}} targets={targets} script="tb" token="tok" />);
    await userEvent.click(screen.getByText('Bo'));
    await userEvent.click(await screen.findByText('Chef'));

    await userEvent.click(screen.getByText('Bo'));
    expect(await screen.findByText('Clear this guess')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Clear this guess'));
    expect(screen.getAllByText('No guess yet')).toHaveLength(2);
  });

  it('Submit theory is disabled with zero guesses, and posts only the guesses made once enabled', async () => {
    const fetchMock = mockFetch({ '/api/script': scriptData(), '/api/table/theory': { ok: true } });
    const onClose = vi.fn();
    render(<TheoryBuilderOverlay open onClose={onClose} targets={targets} script="tb" token="tok-9" />);
    expect(screen.getByText('Submit theory')).toBeDisabled();

    await userEvent.click(screen.getByText('Bo'));
    await userEvent.click(await screen.findByText('Chef'));
    expect(screen.getByText('Submit theory')).toBeEnabled();

    await userEvent.click(screen.getByText('Submit theory'));
    expect(lastBody(fetchMock, '/api/table/theory')).toEqual({
      token: 'tok-9',
      guesses: [{ targetId: 'p2', characterId: 'chef' }],
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reopening starts from a clean slate — a previous half-built theory does not survive', async () => {
    mockFetch({ '/api/script': scriptData() });
    const { rerender } = render(<TheoryBuilderOverlay open onClose={() => {}} targets={targets} script="tb" token="tok" />);
    await userEvent.click(screen.getByText('Bo'));
    await userEvent.click(await screen.findByText('Chef'));
    expect(screen.getAllByText('No guess yet')).toHaveLength(1);

    rerender(<TheoryBuilderOverlay open={false} onClose={() => {}} targets={targets} script="tb" token="tok" />);
    rerender(<TheoryBuilderOverlay open onClose={() => {}} targets={targets} script="tb" token="tok" />);
    expect(screen.getAllByText('No guess yet')).toHaveLength(2);
  });
});
