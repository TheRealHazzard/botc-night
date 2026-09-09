import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScriptBrowseRoster from './ScriptBrowseRoster.jsx';
import { mockFetch } from '../../../../test/fetchMock.js';

const meta = {
  id: 'bmr', name: 'Bad Moon Rising',
  characters: [
    { id: 'washerwoman', name: 'Washerwoman', team: 'townsfolk' },
    { id: 'imp', name: 'Imp', team: 'demon' },
  ],
};

describe('ScriptBrowseRoster', () => {
  beforeEach(() => mockFetch({ '/api/tokens': {} }));

  it("shows the script's playable characters, grouped by team", () => {
    render(<ScriptBrowseRoster meta={meta} />);
    expect(screen.getByText('In this script (2)')).toBeInTheDocument();
    expect(screen.getByText('Washerwoman')).toBeInTheDocument();
    expect(screen.getByText('Imp')).toBeInTheDocument();
  });

  it('has no Choose/Cancel buttons — those live in the header now', () => {
    render(<ScriptBrowseRoster meta={meta} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
