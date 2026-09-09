import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ScriptBadge from './ScriptBadge.jsx';

describe('ScriptBadge', () => {
  it('shows the script logo image by default', () => {
    const { container } = render(<ScriptBadge meta={{ id: 'tb' }} />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/scripts/tb.png');
  });

  it('falls back to the hand-drawn icon (by SCRIPT_ICON) when the logo 404s', () => {
    const { container } = render(<ScriptBadge meta={{ id: 'tb' }} />);
    fireEvent.error(container.querySelector('img'));
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg.icon')).toBeTruthy();
  });

  it('a custom script with no SCRIPT_ICON entry falls back to the scroll icon', () => {
    const { container } = render(<ScriptBadge meta={{ id: 'homebrew' }} />);
    fireEvent.error(container.querySelector('img'));
    expect(container.querySelector('svg.icon').innerHTML).toContain('M6 4h11'); // scroll path
  });
});
