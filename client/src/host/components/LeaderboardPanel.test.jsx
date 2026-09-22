import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LeaderboardPanel from './LeaderboardPanel.jsx';

describe('LeaderboardPanel', () => {
  it('renders each row ranked, with title/subtitle and a custom-formatted value', () => {
    render(
      <LeaderboardPanel
        title="Best good voters"
        subtitle="Correct alignment calls"
        rows={[{ profileId: 'a', name: 'Ada', accuracy: 0.8, correctVotes: 4, totalVotes: 5 }]}
        renderValue={row => `${Math.round(row.accuracy * 100)}% (${row.correctVotes}/${row.totalVotes})`}
        emptyText="Nobody yet"
      />
    );
    expect(screen.getByText('Best good voters')).toBeInTheDocument();
    expect(screen.getByText('Correct alignment calls')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('80% (4/5)')).toBeInTheDocument();
  });

  it('shows the empty-state text when there are no rows', () => {
    render(
      <LeaderboardPanel title="x" rows={[]} renderValue={() => ''} emptyText="Nobody has done this yet" />
    );
    expect(screen.getByText('Nobody has done this yet')).toBeInTheDocument();
  });
});
