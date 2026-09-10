import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import TokenImage from './TokenImage.jsx';

const tokens = vi.hoisted(() => ({ current: {} }));
vi.mock('../hooks/useTokens.js', () => ({
  useTokens: () => tokens.current,
}));

describe('TokenImage', () => {
  it('renders nothing when no art exists for the character', () => {
    tokens.current = {};
    const { container } = render(<TokenImage characterId="imp" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the art at the default "token" size when it exists', () => {
    tokens.current = { imp: '/tokens/imp.png' };
    const { container } = render(<TokenImage characterId="imp" />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/tokens/imp.png');
    expect(img).toHaveClass('token');
  });

  it('accepts a className override for callers that need a different size', () => {
    tokens.current = { imp: '/tokens/imp.png' };
    const { container } = render(<TokenImage characterId="imp" className="scriptchar-token" />);
    expect(container.querySelector('img')).toHaveClass('scriptchar-token');
  });

  it('renders nothing once the image fails to load, rather than a broken-image icon', () => {
    tokens.current = { imp: '/tokens/imp.png' };
    const { container } = render(<TokenImage characterId="imp" />);
    fireEvent.error(container.querySelector('img'));
    expect(container).toBeEmptyDOMElement();
  });

  it('a caller keying on characterId (RoleCard) gets a fresh "failed" state for the new character, not the old one\'s', () => {
    // TokenImage's own `failed` flag has no way to know the character
    // changed — it's the caller's `key` that forces the remount. This
    // proves the mechanism RoleCard.jsx relies on: without a key change
    // (or with the same key), a failed image would stay hidden forever
    // even for a character whose art is perfectly fine.
    tokens.current = { imp: '/tokens/imp.png', washerwoman: '/tokens/washerwoman.png' };
    const { container, rerender } = render(<TokenImage key="imp" characterId="imp" />);
    fireEvent.error(container.querySelector('img'));
    expect(container).toBeEmptyDOMElement();

    rerender(<TokenImage key="washerwoman" characterId="washerwoman" />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/tokens/washerwoman.png');
  });
});
