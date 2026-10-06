import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TheoryPrompt from './TheoryPrompt.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

const theoryPrompt = {
  targets: [
    { id: 'p2', name: 'Bo', color: null, alive: true },
    { id: 'p3', name: 'Cy', color: null, alive: false },
  ],
};

describe('TheoryPrompt', () => {
  it('renders nothing when theoryPrompt is null (already shared today, or not Day)', () => {
    const { container } = render(<TheoryPrompt theoryPrompt={null} script="tb" token="tok" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the teaser and opens the builder overlay on tap', async () => {
    mockFetch({ '/api/script': { edition: 'tb', characters: [{ id: 'chef', name: 'Chef', team: 'townsfolk', ability: 'x' }] } });
    render(<TheoryPrompt theoryPrompt={theoryPrompt} script="tb" token="tok" />);
    expect(screen.getByText('Showcase Theory')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Build a theory'));
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.getByText('Cy')).toBeInTheDocument();
  });
});
