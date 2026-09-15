import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScoreboardTool from './ScoreboardTool.jsx';

describe('ScoreboardTool', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('starts empty, with no rows and no reset button', () => {
    render(<ScoreboardTool />);
    expect(screen.queryByRole('button', { name: /reset all scores/i })).not.toBeInTheDocument();
  });

  it('adding a name creates a zero-score row and clears the input', () => {
    render(<ScoreboardTool />);
    const input = screen.getByPlaceholderText('Add a name…');
    fireEvent.change(input, { target: { value: 'Riya' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(screen.getByText('Riya')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(input.value).toBe('');
  });

  it('+ and - adjust that row\'s score independently of other rows', () => {
    render(<ScoreboardTool />);
    for (const n of ['Riya', 'Sam']) {
      fireEvent.change(screen.getByPlaceholderText('Add a name…'), { target: { value: n } });
      fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Add a point to Riya' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a point to Riya' }));
    fireEvent.click(screen.getByRole('button', { name: 'Subtract a point from Sam' }));

    expect(screen.getByText('2')).toBeInTheDocument(); // Riya
    expect(screen.getByText('-1')).toBeInTheDocument(); // Sam
  });

  it('sorts rows by score, highest first', () => {
    render(<ScoreboardTool />);
    for (const n of ['Low', 'High']) {
      fireEvent.change(screen.getByPlaceholderText('Add a name…'), { target: { value: n } });
      fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Add a point to High' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a point to High' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a point to High' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a point to Low' }));

    const names = screen.getAllByText(/^(Low|High)$/).map(el => el.textContent);
    expect(names).toEqual(['High', 'Low']);
  });

  it('the close button removes a row entirely', () => {
    render(<ScoreboardTool />);
    fireEvent.change(screen.getByPlaceholderText('Add a name…'), { target: { value: 'Gone' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Gone' }));
    expect(screen.queryByText('Gone')).not.toBeInTheDocument();
  });

  it('Reset all scores zeroes every row after confirming, and keeps the rows on cancel', () => {
    render(<ScoreboardTool />);
    fireEvent.change(screen.getByPlaceholderText('Add a name…'), { target: { value: 'Riya' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a point to Riya' }));
    expect(screen.getByText('1')).toBeInTheDocument();

    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: /reset all scores/i }));
    expect(screen.getByText('1')).toBeInTheDocument(); // cancelled — unchanged

    window.confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /reset all scores/i }));
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('persists rows and score changes to localStorage, and reloads them on mount', () => {
    const { unmount } = render(<ScoreboardTool />);
    fireEvent.change(screen.getByPlaceholderText('Add a name…'), { target: { value: 'Riya' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a point to Riya' }));
    unmount();

    render(<ScoreboardTool />);
    expect(screen.getByText('Riya')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
