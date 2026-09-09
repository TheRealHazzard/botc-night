import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RingSeats from './RingSeats.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

const alive = { id: 'p1', name: 'Bo', alive: true, connected: true, color: null };
const dead = { id: 'p2', name: 'Cy', alive: false, connected: true, color: null };
const offline = { id: 'p3', name: 'Di', alive: true, connected: false, color: null };
const colored = { id: 'p4', name: 'Ed', alive: true, connected: true, color: { hex: '#8e2226' } };

describe('RingSeats', () => {
  // useTokens() caches its fetch at module scope for the lifetime of this
  // test file, not per-test — whichever mock is active on the FIRST test
  // that renders a revealed seat is what every later test sees too. Seed
  // it once, up front, with everything any test in this file needs.
  beforeEach(() => mockFetch({ '/api/tokens': { imp: '/tokens/imp.png' } }));

  it('renders a fallback initial for a plain alive/connected seat', () => {
    render(<RingSeats players={[alive]} />);
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('Bo')).toBeInTheDocument();
  });

  it('a dead, unrevealed seat shows a skull instead of an initial', () => {
    const { container } = render(<RingSeats players={[dead]} />);
    expect(container.querySelector('.rseat.dead svg.icon')).toBeTruthy();
    expect(screen.queryByText('C')).not.toBeInTheDocument();
  });

  it('marks offline seats with the offline class, still showing their initial', () => {
    const { container } = render(<RingSeats players={[offline]} />);
    expect(container.querySelector('.rseat.offline')).toBeTruthy();
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('a colored, connected seat tints its fallback avatar from that color', () => {
    const { container } = render(<RingSeats players={[colored]} />);
    const avatar = container.querySelector('.rseat-avatar');
    expect(avatar.style.borderColor).toBe('rgb(142, 34, 38)');
    expect(avatar.style.color).toBe('rgb(142, 34, 38)');
  });

  it('a color does not tint the avatar when the player is disconnected', () => {
    const disconnectedColored = { ...colored, connected: false };
    const { container } = render(<RingSeats players={[disconnectedColored]} />);
    expect(container.querySelector('.rseat-avatar').style.borderColor).toBe('');
  });

  it('marks the ring dense past 10 seats', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, alive: true, connected: true, color: null }));
    const { container } = render(<RingSeats players={many} />);
    expect(container.querySelector('.ring')).toHaveClass('dense');
  });

  it('applies the entering class only to ids in enteringIds', () => {
    const { container } = render(<RingSeats players={[alive, dead]} enteringIds={new Set(['p1'])} />);
    const seats = container.querySelectorAll('.rseat');
    expect(seats[0]).toHaveClass('entering');
    expect(seats[1]).not.toHaveClass('entering');
  });

  it('revealed mode shows the character token image, colored border, and shrouds a dead player', () => {
    const revealedDead = { ...dead, characterId: 'imp', color: { hex: '#111111' }, team: 'demon' };
    const { container } = render(<RingSeats players={[revealedDead]} revealed />);
    const img = container.querySelector('img.rseat-token');
    expect(img).toHaveAttribute('src', '/tokens/imp.png');
    expect(container.querySelector('.rseat-avatar')).toHaveClass('shrouded');
    expect(container.querySelector('.rseat-avatar').style.borderColor).toBe('rgb(17, 17, 17)');
  });

  it('revealed mode falls back to the initial if the token image 404s', () => {
    const revealed = { ...alive, characterId: 'imp' };
    const { container } = render(<RingSeats players={[revealed]} revealed />);
    const img = container.querySelector('img.rseat-token');
    fireEvent.error(img);
    expect(container.querySelector('img.rseat-token')).not.toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('revealed mode with no art at all for that character shows the fallback initial directly', () => {
    const revealed = { ...alive, characterId: 'unknown-char' };
    render(<RingSeats players={[revealed]} revealed />);
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('a missing team-badge image is silently dropped, not shown broken', () => {
    const revealed = { ...alive, characterId: 'imp', team: 'demon' };
    const { container } = render(<RingSeats players={[revealed]} revealed />);
    const badge = container.querySelector('img.team-badge');
    expect(badge).toBeInTheDocument();
    fireEvent.error(badge);
    expect(container.querySelector('img.team-badge')).not.toBeInTheDocument();
  });
});
