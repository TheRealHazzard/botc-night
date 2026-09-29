import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import NightView from './NightView.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

const players = [
  { id: 'p1', name: 'Ada', alive: true, connected: true, submitted: true, color: null },
  { id: 'p2', name: 'Bo', alive: false, connected: true, submitted: false, color: null },
];
const activeScriptMeta = { id: 'tb', name: 'Trouble Brewing', difficulty: 1, description: 'x', decidedGames: 0 };
const config = { windowSeconds: 60 };

describe('NightView', () => {
  beforeEach(() => mockFetch({ '/api/tokens': {}, '/trivia.json': [] }));

  it('shows the night counter, dread narration, and answered count', () => {
    render(<NightView players={players} nightNumber={2} windowEndsAt={Date.now() + 15000} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    expect(screen.getByText('Night 2')).toBeInTheDocument();
    expect(screen.getByText('Close your eyes. The town sleeps.')).toBeInTheDocument();
    // p2 is dead, so "living" counts only Ada — 1 of 1, not 1 of 2.
    expect(screen.getByText((_, node) => node?.textContent === '1 of 1 have answered.')).toBeInTheDocument();
  });

  it('shows the countdown timer when a window is open', () => {
    render(<NightView players={players} nightNumber={1} windowEndsAt={Date.now() + 8000} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('shows no timer once the window is null', () => {
    const { container } = render(<NightView players={players} nightNumber={1} windowEndsAt={null} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    expect(container.querySelector('.clockwrap')).not.toBeInTheDocument();
  });

  // Same expected-value math Countdown.jsx itself uses for the ring's fill
  // fraction — recomputed here (not hardcoded) so the assertion tracks the
  // real formula rather than a magic number that could quietly drift.
  const expectedDashoffset = (left, total) => {
    const frac = Math.max(0, Math.min(1, left / (total || 1)));
    const size = 200, stroke = 10, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return (c * (1 - frac)).toFixed(1);
  };
  const ringDashoffset = container => container.querySelectorAll('.ring-svg circle')[1].getAttribute('stroke-dashoffset');

  it('the ring reads windowTotalSeconds, not live config — a host changing Timing settings mid-window does not desync it', () => {
    const windowEndsAt = Date.now() + 8000;
    const { container, rerender } = render(
      <NightView players={players} nightNumber={1} windowEndsAt={windowEndsAt} windowTotalSeconds={20} config={{ windowSeconds: 20 }} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(ringDashoffset(container)).toBe(expectedDashoffset(8, 20));

    // The host adjusts Timing settings mid-window (SettingsOverlay has no
    // phase gate) — config.windowSeconds changes, but windowTotalSeconds
    // (what this window actually started from) does not.
    rerender(
      <NightView players={players} nightNumber={1} windowEndsAt={windowEndsAt} windowTotalSeconds={20} config={{ windowSeconds: 90 }} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(ringDashoffset(container)).toBe(expectedDashoffset(8, 20));
  });

  it('falls back to a live config recompute only when windowTotalSeconds is absent (a window opened before this field existed)', () => {
    const windowEndsAt = Date.now() + 8000;
    const { container } = render(
      <NightView players={players} nightNumber={1} windowEndsAt={windowEndsAt} config={{ windowSeconds: 90 }} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(ringDashoffset(container)).toBe(expectedDashoffset(8, 90));
  });

  it('a fresh whim-roll log line shows the beat; nothing shows on the initial mount', () => {
    const { rerender } = render(
      <NightView players={players} nightNumber={2} windowEndsAt={null} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} log={[]} />
    );
    expect(screen.queryByText('A quiet decision, unseen.')).not.toBeInTheDocument();

    const whimLog = [{ night: 2, phase: 'night', text: 'A quiet decision was made, unseen.', secret: false }];
    rerender(<NightView players={players} nightNumber={2} windowEndsAt={null} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} log={whimLog} />);
    expect(screen.getByText('A quiet decision, unseen.')).toBeInTheDocument();
  });
});
