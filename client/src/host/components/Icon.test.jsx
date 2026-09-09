import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Icon from './Icon.jsx';
import { ICON_PATHS } from '../lib/icons.js';

describe('Icon', () => {
  it('renders every name in ICON_PATHS without throwing, with non-empty markup', () => {
    for (const name of Object.keys(ICON_PATHS)) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector('svg.icon');
      expect(svg).toBeTruthy();
      expect(svg.innerHTML.length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('applies an explicit size and an extra className', () => {
    const { container } = render(<Icon name="moon" size={20} className="brand" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('icon', 'brand');
    expect(svg.style.width).toBe('20px');
    expect(svg.style.height).toBe('20px');
  });

  it('an unknown name renders an empty icon rather than throwing', () => {
    const { container } = render(<Icon name="not-a-real-icon" />);
    expect(container.querySelector('svg.icon')).toBeTruthy();
  });
});
