import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SidepanelCard from './SidepanelCard.jsx';

describe('SidepanelCard', () => {
  it('renders the title and children', () => {
    render(<SidepanelCard title="Table"><p>Body</p></SidepanelCard>);
    expect(screen.getByText('Table')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });
});
