import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VoteBar from './VoteBar.jsx';

describe('VoteBar', () => {
  it('below threshold: no "met" class, proportional width', () => {
    const { container } = render(<VoteBar yes={2} threshold={3} />);
    expect(screen.getByText('2 / 3 needed to execute')).toBeInTheDocument();
    const fill = container.querySelector('.votebar-fill');
    expect(fill).not.toHaveClass('met');
    expect(fill.style.width).toBe('66.66666666666666%');
  });

  it('at threshold: gains the "met" class, 100% width', () => {
    const { container } = render(<VoteBar yes={3} threshold={3} />);
    const fill = container.querySelector('.votebar-fill');
    expect(fill).toHaveClass('met');
    expect(fill.style.width).toBe('100%');
  });

  it('above threshold: width still caps at 100%', () => {
    const { container } = render(<VoteBar yes={5} threshold={3} />);
    expect(container.querySelector('.votebar-fill').style.width).toBe('100%');
  });
});
