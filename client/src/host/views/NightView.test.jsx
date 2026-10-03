import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NightView from './NightView.jsx';
import { mockFetch } from '../../../test/fetchMock.js';
import { subscribeNarratorLog } from '../lib/narratorLog.js';

const players = [
  { id: 'p1', name: 'Ada', alive: true, connected: true, submitted: true, color: null },
  { id: 'p2', name: 'Bo', alive: false, connected: true, submitted: false, color: null },
];
const activeScriptMeta = { id: 'tb', name: 'Trouble Brewing', difficulty: 1, description: 'x', decidedGames: 0 };
const config = { windowSeconds: 60 };

describe('NightView', () => {
  beforeEach(() => mockFetch({ '/api/tokens': {}, '/trivia.json': [] }));

  it('shows the night counter above the ring, and the answered count', async () => {
    render(<NightView players={players} nightNumber={2} windowEndsAt={Date.now() + 15000} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    expect(screen.getByText('Night 2')).toBeInTheDocument();
    // "X of Y answered" now lives on the Controls tab, beside the night window.
    await userEvent.click(screen.getByRole('button', { name: 'Controls' }));
    // p2 is dead, so "living" counts only Ada — 1 of 1, not 1 of 2.
    expect(screen.getByText((_, node) => node?.textContent === '1 of 1 have answered.')).toBeInTheDocument();
  });

  // The opening line's own exact wording/rotation/determinism is
  // narratorLines.js's own responsibility — see narratorLines.test.js.
  // This just confirms NightView actually wires that line through to the
  // narrator log (and so to speech.js) rather than, say, silently
  // dropping it along with the old visible narration text.
  it('speaks (and logs) the night-open line', () => {
    const entries = [];
    const unsubscribe = subscribeNarratorLog(e => entries.push(e));
    render(<NightView players={players} nightNumber={1} windowEndsAt={Date.now() + 15000} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    unsubscribe();
    expect(entries.some(e => e.text === 'Close your eyes. The town sleeps.')).toBe(true);
  });

  it('shows the countdown timer when a window is open', async () => {
    render(<NightView players={players} nightNumber={1} windowEndsAt={Date.now() + 8000} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    await userEvent.click(screen.getByRole('button', { name: 'Controls' }));
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('shows no timer once the window is null', async () => {
    const { container } = render(<NightView players={players} nightNumber={1} windowEndsAt={null} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    await userEvent.click(screen.getByRole('button', { name: 'Controls' }));
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

  it('the ring reads windowTotalSeconds, not live config — a host changing Timing settings mid-window does not desync it', async () => {
    const windowEndsAt = Date.now() + 8000;
    const { container, rerender } = render(
      <NightView players={players} nightNumber={1} windowEndsAt={windowEndsAt} windowTotalSeconds={20} config={{ windowSeconds: 20 }} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Controls' }));
    expect(ringDashoffset(container)).toBe(expectedDashoffset(8, 20));

    // The host adjusts Timing settings mid-window (SettingsOverlay has no
    // phase gate) — config.windowSeconds changes, but windowTotalSeconds
    // (what this window actually started from) does not.
    rerender(
      <NightView players={players} nightNumber={1} windowEndsAt={windowEndsAt} windowTotalSeconds={20} config={{ windowSeconds: 90 }} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    expect(ringDashoffset(container)).toBe(expectedDashoffset(8, 20));
  });

  it('falls back to a live config recompute only when windowTotalSeconds is absent (a window opened before this field existed)', async () => {
    const windowEndsAt = Date.now() + 8000;
    const { container } = render(
      <NightView players={players} nightNumber={1} windowEndsAt={windowEndsAt} config={{ windowSeconds: 90 }} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Controls' }));
    expect(ringDashoffset(container)).toBe(expectedDashoffset(8, 90));
  });

  it('a fresh whim-roll log line logs the beat; nothing logged on the initial mount', () => {
    const entries = [];
    const unsubscribe = subscribeNarratorLog(e => entries.push(e));
    const { rerender } = render(
      <NightView players={players} nightNumber={2} windowEndsAt={null} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} log={[]} />
    );
    expect(entries.some(e => e.text === 'A quiet decision, unseen.')).toBe(false);

    const whimLog = [{ night: 2, phase: 'night', text: 'A quiet decision was made, unseen.', secret: false }];
    rerender(<NightView players={players} nightNumber={2} windowEndsAt={null} config={config} script="tb" scriptChars={[]} activeScriptMeta={activeScriptMeta} log={whimLog} />);
    unsubscribe();
    expect(entries.some(e => e.text === 'A quiet decision, unseen.')).toBe(true);
  });
});
