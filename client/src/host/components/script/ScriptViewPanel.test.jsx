import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScriptViewPanel from './ScriptViewPanel.jsx';

const meta = { id: 'tb', name: 'Trouble Brewing', difficulty: 1, description: 'The original.', decidedGames: 0 };

describe('ScriptViewPanel', () => {
  it('shows the script name and description, with an enabled Change script button by default', async () => {
    const onChangeScript = vi.fn();
    render(<ScriptViewPanel meta={meta} onChangeScript={onChangeScript} />);
    expect(screen.getByText('Trouble Brewing')).toBeInTheDocument();
    expect(screen.getByText('The original.')).toBeInTheDocument();
    const btn = screen.getByText(/change script/i);
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(onChangeScript).toHaveBeenCalledTimes(1);
  });

  it('locked disables the button and never calls onChangeScript', async () => {
    const onChangeScript = vi.fn();
    render(<ScriptViewPanel meta={meta} locked onChangeScript={onChangeScript} />);
    const btn = screen.getByText(/change script/i);
    expect(btn).toBeDisabled();
    expect(btn).toHaveClass('ghostbtn');
  });
});
