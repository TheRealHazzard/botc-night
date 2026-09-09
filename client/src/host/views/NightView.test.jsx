import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import NightView from './NightView.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

const players = [
  { id: 'p1', name: 'Ada', alive: true, connected: true, submitted: true, color: null },
  { id: 'p2', name: 'Bo', alive: false, connected: true, submitted: false, color: null },
];
const activeScriptMeta = { id: 'tb', name: 'Trouble Brewing', difficulty: 1, description: 'x', decidedGames: 0 };
const config = { windowSeconds: 60, wave2Seconds: 20 };

describe('NightView', () => {
  beforeEach(() => mockFetch({ '/api/tokens': {}, '/trivia.json': [] }));

  it('shows the night counter, dread narration, and answered count', () => {
    render(<NightView players={players} nightNumber={2} wave={1} windowEndsAt={Date.now() + 15000} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    expect(screen.getByText('Night 2')).toBeInTheDocument();
    expect(screen.getByText('Close your eyes. The town sleeps.')).toBeInTheDocument();
    // p2 is dead, so "living" counts only Ada — 1 of 1, not 1 of 2.
    expect(screen.getByText((_, node) => node?.textContent === '1 of 1 have answered.')).toBeInTheDocument();
  });

  it('wave 2 shows the "again" label and the more dread-toned line', () => {
    render(<NightView players={players} nightNumber={2} wave={2} windowEndsAt={Date.now() + 15000} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    expect(screen.getByText('Night 2 — again')).toBeInTheDocument();
    expect(screen.getByText('Something is not finished.')).toBeInTheDocument();
  });

  it('shows the countdown timer when a window is open', () => {
    render(<NightView players={players} nightNumber={1} wave={1} windowEndsAt={Date.now() + 8000} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('shows no timer once the window is null', () => {
    const { container } = render(<NightView players={players} nightNumber={1} wave={1} windowEndsAt={null} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    expect(container.querySelector('.clockwrap')).not.toBeInTheDocument();
  });
});
