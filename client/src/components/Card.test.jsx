import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Card from './Card.jsx';

describe('Card', () => {
  it('renders the title and children when a title is given', () => {
    render(<Card title="Daylight"><p>Body</p></Card>);
    expect(screen.getByText('Daylight')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('renders no heading at all when title is omitted (ResultCard\'s own shape)', () => {
    const { container } = render(<Card><p>Body</p></Card>);
    expect(container.querySelector('.card-heading')).not.toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('renders the action slot next to the title', () => {
    render(<Card title="Seated as Bo" action={<button>Change</button>}><p>Body</p></Card>);
    expect(screen.getByText('Seated as Bo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });
});
