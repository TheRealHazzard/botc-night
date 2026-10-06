import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LbPanel from './LbPanel.jsx';

describe('LbPanel', () => {
  it('renders the title, action, and children', () => {
    render(<LbPanel title="Past games" action={<button>Toggle</button>}><p>Body</p></LbPanel>);
    expect(screen.getByText('Past games')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle' })).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('renders no heading at all when title is omitted', () => {
    const { container } = render(<LbPanel><p>Body</p></LbPanel>);
    expect(container.querySelector('.lb-panel-heading')).not.toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('appends an extra className alongside the base lb-panel class', () => {
    const { container } = render(<LbPanel title="x" className="sim-stage"><p>Body</p></LbPanel>);
    const panel = container.querySelector('.lb-panel');
    expect(panel).toHaveClass('sim-stage');
  });
});
