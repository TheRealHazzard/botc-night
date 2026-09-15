import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RandomizerTool from './RandomizerTool.jsx';

describe('RandomizerTool', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('starts with the 4 default sample names, no pick shown yet', () => {
    render(<RandomizerTool />);
    expect(screen.getByText('4 entries')).toBeInTheDocument();
    expect(screen.queryByText('Alex')).not.toBeInTheDocument(); // in the textarea, not rendered as a pick
  });

  it('Pick highlights one entry from the list', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // 4 entries: index 3 -> "Casey"
    render(<RandomizerTool />);
    fireEvent.click(screen.getByRole('button', { name: /pick/i }));
    expect(screen.getByText('Casey')).toBeInTheDocument();
  });

  it('editing the list clears any prior pick, filters blank lines, and persists to localStorage', () => {
    render(<RandomizerTool />);
    fireEvent.click(screen.getByRole('button', { name: /pick/i }));
    const textarea = screen.getByPlaceholderText('One entry per line');
    fireEvent.change(textarea, { target: { value: 'One\n\nTwo\n  \nThree' } });
    expect(screen.getByText('3 entries')).toBeInTheDocument();
    expect(localStorage.getItem('botc-toolkit-randomizer-entries')).toBe('One\n\nTwo\n  \nThree');
  });

  it('Pick is disabled when the list is empty', () => {
    render(<RandomizerTool />);
    fireEvent.change(screen.getByPlaceholderText('One entry per line'), { target: { value: '   \n  ' } });
    expect(screen.getByText('0 entries')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pick/i })).toBeDisabled();
  });

  it('loads a previously saved list from localStorage on mount', () => {
    localStorage.setItem('botc-toolkit-randomizer-entries', 'Only One');
    render(<RandomizerTool />);
    expect(screen.getByText('1 entry')).toBeInTheDocument();
  });
});
