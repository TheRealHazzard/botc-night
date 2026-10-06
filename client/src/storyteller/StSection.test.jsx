import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StSection from './StSection.jsx';

describe('StSection', () => {
  it('renders the title and children', () => {
    render(<StSection title="Nominate"><p>Body</p></StSection>);
    expect(screen.getByText('Nominate')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });
});
