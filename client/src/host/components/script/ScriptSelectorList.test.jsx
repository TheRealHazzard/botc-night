import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScriptSelectorList from './ScriptSelectorList.jsx';

const scripts = [
  { id: 'tb', name: 'Trouble Brewing', difficulty: 1, playable: true },
  { id: 'bmr', name: 'Bad Moon Rising', difficulty: 2, playable: true },
  { id: 'lunar-eclipse', name: 'Lunar Eclipse', difficulty: 4, playable: false },
];

describe('ScriptSelectorList', () => {
  it('shows a loading message when scripts have not resolved yet', () => {
    render(<ScriptSelectorList scripts={null} browseIndex={0} currentScriptId="tb" onBrowse={() => {}} />);
    expect(screen.getByText(/loading scripts/i)).toBeInTheDocument();
  });

  it('marks the browseIndex row as browsed, and the current script with the active dot', () => {
    render(<ScriptSelectorList scripts={scripts} browseIndex={1} currentScriptId="tb" onBrowse={() => {}} />);
    const rows = screen.getAllByRole('button');
    expect(rows[0]).not.toHaveClass('browsed');
    expect(rows[1]).toHaveClass('browsed');
    expect(rows[0].querySelector('.script-list-row-active-dot')).toBeTruthy();
    expect(rows[1].querySelector('.script-list-row-active-dot')).toBeNull();
  });

  it('a locked script gets the locked class and a "Soon" badge', () => {
    render(<ScriptSelectorList scripts={scripts} browseIndex={0} currentScriptId="tb" onBrowse={() => {}} />);
    const rows = screen.getAllByRole('button');
    expect(rows[2]).toHaveClass('locked');
    expect(screen.getByText('Soon')).toBeInTheDocument();
  });

  it('clicking a row calls onBrowse with its index, not a POST', async () => {
    const onBrowse = vi.fn();
    render(<ScriptSelectorList scripts={scripts} browseIndex={0} currentScriptId="tb" onBrowse={onBrowse} />);
    await userEvent.click(screen.getByText('Bad Moon Rising'));
    expect(onBrowse).toHaveBeenCalledWith(1);
  });
});
