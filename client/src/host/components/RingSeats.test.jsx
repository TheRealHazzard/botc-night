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

  it('renders a plain alive/connected seat with no initial letter — the token art and name below carry it', () => {
    const { container } = render(<RingSeats players={[alive]} />);
    expect(container.querySelector('.rseat-avatar').textContent).toBe('');
    expect(screen.getByText('Bo')).toBeInTheDocument();
  });

  it('a dead, unrevealed seat shows the dead-token art alone, no initial or icon on top of it', () => {
    const { container } = render(<RingSeats players={[dead]} />);
    expect(container.querySelector('.rseat.dead svg.icon')).toBeFalsy();
    expect(screen.queryByText('C')).not.toBeInTheDocument();
    const avatar = container.querySelector('.rseat.dead .rseat-avatar');
    expect(avatar).toBeTruthy();
    expect(avatar.textContent).toBe('');
  });

  it('sets --seat-i to each seat\'s own position index, for the dusk/dawn sweep in styles.css to key off', () => {
    const three = [alive, dead, offline];
    const { container } = render(<RingSeats players={three} />);
    const seats = container.querySelectorAll('.rseat');
    expect(seats[0].style.getPropertyValue('--seat-i')).toBe('0');
    expect(seats[1].style.getPropertyValue('--seat-i')).toBe('1');
    expect(seats[2].style.getPropertyValue('--seat-i')).toBe('2');
  });

  it('marks offline seats with the offline class', () => {
    const { container } = render(<RingSeats players={[offline]} />);
    expect(container.querySelector('.rseat.offline')).toBeTruthy();
    expect(screen.getByText('Di')).toBeInTheDocument();
  });

  it('a colored, connected seat borders its avatar in that color — the fill itself stays the plain alive/dead read', () => {
    const { container } = render(<RingSeats players={[colored]} />);
    const avatar = container.querySelector('.rseat-avatar');
    expect(avatar.style.borderColor).toBe('rgb(142, 34, 38)');
    expect(avatar.style.background).toBe('');
    expect(avatar.style.color).toBe('');
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

  it('has no glow class by default, and takes glow-good/glow-evil from the glow prop', () => {
    const { container, rerender } = render(<RingSeats players={[alive]} />);
    expect(container.querySelector('.ring')).not.toHaveClass('glow-good');
    expect(container.querySelector('.ring')).not.toHaveClass('glow-evil');

    rerender(<RingSeats players={[alive]} glow="good" />);
    expect(container.querySelector('.ring')).toHaveClass('glow-good');

    rerender(<RingSeats players={[alive]} glow="evil" />);
    expect(container.querySelector('.ring')).toHaveClass('glow-evil');
    expect(container.querySelector('.ring')).not.toHaveClass('glow-good');
  });

  it('has no pace class by default, and takes pace-green/yellow/red from the pace prop', () => {
    const { container, rerender } = render(<RingSeats players={[alive]} />);
    expect(container.querySelector('.ring')).not.toHaveClass('pace-green', 'pace-yellow', 'pace-red');

    rerender(<RingSeats players={[alive]} pace="green" />);
    expect(container.querySelector('.ring')).toHaveClass('pace-green');

    rerender(<RingSeats players={[alive]} pace="red" />);
    expect(container.querySelector('.ring')).toHaveClass('pace-red');
    expect(container.querySelector('.ring')).not.toHaveClass('pace-green');
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

  it('revealed mode falls back to the plain token art (no initial) if the token image 404s', () => {
    const revealed = { ...alive, characterId: 'imp' };
    const { container } = render(<RingSeats players={[revealed]} revealed />);
    const img = container.querySelector('img.rseat-token');
    fireEvent.error(img);
    expect(container.querySelector('img.rseat-token')).not.toBeInTheDocument();
    expect(container.querySelector('.rseat-avatar').textContent).toBe('');
  });

  it('revealed mode with no art at all for that character falls back to the plain token art too', () => {
    const revealed = { ...alive, characterId: 'unknown-char' };
    const { container } = render(<RingSeats players={[revealed]} revealed />);
    expect(container.querySelector('.rseat-avatar').textContent).toBe('');
  });

  it('a dead player who has not spent their ghost vote gets the ghost layer; a living or spent player does not', () => {
    const spent = { ...dead, id: 'p5', ghostVoteUsed: true };
    const unspent = { ...dead, id: 'p6', ghostVoteUsed: false };
    const { container } = render(<RingSeats players={[alive, spent, unspent]} />);
    const seats = container.querySelectorAll('.rseat');
    expect(seats[0].querySelector('.ghost-layer')).toBeFalsy(); // alive
    expect(seats[1].querySelector('.ghost-layer')).toBeFalsy(); // dead, already spent
    expect(seats[2].querySelector('.ghost-layer')).toBeTruthy(); // dead, still has it
  });

  it('the final reveal hides the ghost layer even for a dead player who never spent their vote', () => {
    const unspent = { ...dead, characterId: 'imp', ghostVoteUsed: false };
    const { container } = render(<RingSeats players={[unspent]} revealed />);
    expect(container.querySelector('.ghost-layer')).toBeFalsy();
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
