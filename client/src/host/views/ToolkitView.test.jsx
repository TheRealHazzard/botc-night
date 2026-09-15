import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ToolkitView from './ToolkitView.jsx';

describe('ToolkitView', () => {
  beforeEach(() => localStorage.clear());

  it('opens on the Timer tool', () => {
    render(<ToolkitView />);
    expect(screen.getByRole('button', { name: 'Timer' })).toHaveClass('panel-tab', 'active');
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });

  it('switching tabs mounts the chosen tool and unmounts the previous one', () => {
    render(<ToolkitView />);
    fireEvent.click(screen.getByRole('button', { name: 'Scoreboard' }));
    expect(screen.getByRole('button', { name: 'Scoreboard' })).toHaveClass('panel-tab', 'active');
    expect(screen.getByPlaceholderText('Add a name…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Randomizer' }));
    expect(screen.getByPlaceholderText('One entry per line')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Add a name…')).not.toBeInTheDocument();
  });
});
