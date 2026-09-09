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
});
