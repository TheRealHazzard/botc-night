import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TopBar from './TopBar.jsx';

describe('TopBar', () => {
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
});
