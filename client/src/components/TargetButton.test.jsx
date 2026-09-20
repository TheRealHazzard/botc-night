import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TargetButton from './TargetButton.jsx';

describe('TargetButton', () => {
  it('shows a ghost icon only for a target explicitly marked not alive', () => {
    const { container, rerender } = render(<TargetButton target={{ id: 'p1', name: 'Bo' }} selected={false} onClick={() => {}} />);
    expect(container.querySelector('svg')).not.toBeInTheDocument();

    rerender(<TargetButton target={{ id: 'p1', name: 'Bo', alive: false }} selected={false} onClick={() => {}} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('uses the target color for its border, and adds the "on" class when selected', () => {
    render(<TargetButton target={{ id: 'p1', name: 'Bo', color: { hex: '#8e2226' } }} selected onClick={() => {}} />);
    const btn = screen.getByText('Bo').closest('button');
    expect(btn).toHaveClass('target', 'on');
    expect(btn).toHaveStyle({ borderColor: '#8e2226' });
  });

  it('fires onClick and respects disabled', () => {
    const onClick = vi.fn();
    render(<TargetButton target={{ id: 'p1', name: 'Bo' }} selected={false} onClick={onClick} disabled />);
    expect(screen.getByText('Bo').closest('button')).toBeDisabled();
  });

  it('carries aria-pressed for the selected state, and a screen-reader-only "(dead)" tag', () => {
    const { rerender } = render(<TargetButton target={{ id: 'p1', name: 'Bo' }} selected={false} onClick={() => {}} />);
    expect(screen.getByText('Bo').closest('button')).toHaveAttribute('aria-pressed', 'false');

    rerender(<TargetButton target={{ id: 'p1', name: 'Bo', alive: false }} selected onClick={() => {}} />);
    const btn = screen.getByText('Bo').closest('button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn).toHaveTextContent('(dead)');
  });
});
