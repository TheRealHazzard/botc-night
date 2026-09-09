import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import TeamBadgeImg from './TeamBadgeImg.jsx';

describe('TeamBadgeImg', () => {
  it('renders the team\'s own icon at /team-icons/<team>.png', () => {
    const { container } = render(<TeamBadgeImg team="demon" />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/team-icons/demon.png');
  });

  it('renders nothing once the image fails to load, rather than a text fallback', () => {
    const { container } = render(<TeamBadgeImg team="demon" />);
    fireEvent.error(container.querySelector('img'));
    expect(container).toBeEmptyDOMElement();
  });

  it('accepts a className override for callers that need a different size', () => {
    const { container } = render(<TeamBadgeImg team="demon" className="featured-role-team-icon" />);
    expect(container.querySelector('img')).toHaveClass('featured-role-team-icon');
  });
});
