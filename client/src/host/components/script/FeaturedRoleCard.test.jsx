import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import FeaturedRoleCard from './FeaturedRoleCard.jsx';
import { mockFetch } from '../../../../test/fetchMock.js';

const character = { id: 'lunatic', name: 'Lunatic', team: 'outsider', ability: 'You think you are a Demon, but you are not.' };

describe('FeaturedRoleCard', () => {
  // useTokens() caches its fetch at module scope for this whole test file,
  // not per-test — one shared empty-manifest fixture, same as
  // ScriptRosterCard.test.jsx, so every test here consistently exercises
  // the no-token-art fallback path.
  beforeEach(() => mockFetch({ '/api/tokens': {} }));

  it('shows the name, team, and full ability text', () => {
    render(<FeaturedRoleCard character={character} />);
    expect(screen.getByText('Featured Role')).toBeInTheDocument();
    expect(screen.getByText('Lunatic')).toBeInTheDocument();
    expect(screen.getByText('Outsiders')).toBeInTheDocument();
    expect(screen.getByText(character.ability)).toBeInTheDocument();
  });

  it('falls back to the name\'s first letter when there is no token art', () => {
    const { container } = render(<FeaturedRoleCard character={character} />);
    expect(container.querySelector('.featured-role-token-fallback').textContent).toBe('L');
    expect(container.querySelector('.featured-role-token')).not.toBeInTheDocument();
  });
});
