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

  // The Storyteller-controls entry point moved to a full-width banner in
  // PlayerApp.jsx (see its own test file) specifically so this header
  // never has to fit a third button — nothing leader-related belongs here
  // any more.
  it('never renders a Storyteller button, regardless of props', () => {
    render(<TopBar onOpenScript={() => {}} />);
    expect(screen.queryByText(/storyteller/i)).not.toBeInTheDocument();
  });
});
