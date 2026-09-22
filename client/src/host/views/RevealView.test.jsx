import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RevealView from './RevealView.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

const players = [{ id: 'p1', name: 'Ada', alive: true, connected: true, color: null }];
const activeScriptMeta = { id: 'tb', name: 'Trouble Brewing', difficulty: 1, description: 'x', decidedGames: 0 };

describe('RevealView', () => {
  beforeEach(() => mockFetch({ '/api/tokens': {} }));

  it('shows the reveal narration and the seating ring', () => {
    render(<RevealView players={players} scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    expect(screen.getByText('Look at your hands.')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('shows Night falls plainly on the right, with no duplicate copy anywhere else', () => {
    render(<RevealView players={players} scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    expect(screen.getAllByText(/night falls/i)).toHaveLength(1);
  });

  it('Night falls posts /api/table/night', async () => {
    const fetchMock = mockFetch({ '/api/tokens': {}, '/api/table/night': {} });
    render(<RevealView players={players} scriptChars={[]} activeScriptMeta={activeScriptMeta} />);
    await userEvent.click(screen.getAllByText(/night falls/i)[0]);
    expect(fetchMock.calls.some(c => c.url.includes('/api/table/night'))).toBe(true);
  });
});
