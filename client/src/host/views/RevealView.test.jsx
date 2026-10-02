import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RevealView from './RevealView.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

const activeScriptMeta = { id: 'tb', name: 'Trouble Brewing', difficulty: 1, description: 'x', decidedGames: 0 };

// The seating ring itself no longer lives inside this view — it's
// rendered once, permanently, by App.jsx and portaled into this view's
// ring-slot placeholder (see App.jsx's ring-persistence wiring). A bare
// render of RevealView has no portal target attached, so the ring-slot
// stays empty; ring content/gating is covered by App.test.jsx instead.
describe('RevealView', () => {
  beforeEach(() => mockFetch({ '/api/tokens': {} }));

  it('shows the reveal narration', () => {
    render(<RevealView scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    expect(screen.getByText('Look at your hands.')).toBeInTheDocument();
  });

  it('shows Night falls plainly on the Controls tab, with no duplicate copy anywhere else', async () => {
    render(<RevealView scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    await userEvent.click(screen.getByRole('button', { name: 'Controls' }));
    expect(screen.getAllByText(/night falls/i)).toHaveLength(1);
  });

  it('Night falls posts /api/table/night', async () => {
    const fetchMock = mockFetch({ '/api/tokens': {}, '/api/table/night': {} });
    render(<RevealView scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    await userEvent.click(screen.getByRole('button', { name: 'Controls' }));
    await userEvent.click(screen.getAllByText(/night falls/i)[0]);
    expect(fetchMock.calls.some(c => c.url.includes('/api/table/night'))).toBe(true);
  });
});
