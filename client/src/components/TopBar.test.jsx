import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TopBar from './TopBar.jsx';

describe('TopBar', () => {
  beforeEach(() => localStorage.clear());

  it('calls onOpenScript when "The script" is tapped', async () => {
    const onOpenScript = vi.fn();
    render(<TopBar onOpenScript={onOpenScript} />);
    await userEvent.click(screen.getByText('The script'));
    expect(onOpenScript).toHaveBeenCalledTimes(1);
  });

  it('shows only the wordmark and the Script button — no player name/Change here (that lives in the Seated-as card now)', () => {
    render(<TopBar onOpenScript={() => {}} />);
    expect(screen.getByAltText('Blood On The Clocktower')).toBeInTheDocument();
    expect(screen.queryByText('Change')).not.toBeInTheDocument();
  });

  it('tapping "Aa" cycles the text size, reflected in its own label', async () => {
    render(<TopBar onOpenScript={() => {}} />);
    const btn = screen.getByText('Aa');
    expect(btn).toHaveAccessibleName(/100%/);
    await userEvent.click(btn);
    expect(btn).toHaveAccessibleName(/115%/);
  });

  it('the Storyteller button is hidden for a non-leader', () => {
    render(<TopBar onOpenScript={() => {}} isLeader={false} />);
    expect(screen.queryByText('Storyteller')).not.toBeInTheDocument();
  });

  it('the Storyteller button shows for the leader and calls onOpenLeaderControls', async () => {
    const onOpenLeaderControls = vi.fn();
    render(<TopBar onOpenScript={() => {}} onOpenLeaderControls={onOpenLeaderControls} isLeader={true} />);
    await userEvent.click(screen.getByText('Storyteller'));
    expect(onOpenLeaderControls).toHaveBeenCalledTimes(1);
  });
});
