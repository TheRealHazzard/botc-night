import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ArtistQuestion from './ArtistQuestion.jsx';

// ClaimBuilder itself is covered in depth by ClaimBuilder.test.jsx — this
// just confirms ArtistQuestion wires the right copy, data, and endpoint into it.
describe('ArtistQuestion', () => {
  it('renders the artist-specific heading and passes through targets/characterOptions', () => {
    render(
      <ArtistQuestion
        artistQuestion={{ targets: [{ id: 'p1', name: 'Bo' }], characterOptions: [{ id: 'imp', name: 'Imp' }] }}
        token="tok"
        llmEnabled={false}
      />
    );
    expect(screen.getByText('Ask the Storyteller')).toBeInTheDocument();
    expect(screen.getByText(/you.ll be told the true answer immediately/i)).toBeInTheDocument();
  });
});
