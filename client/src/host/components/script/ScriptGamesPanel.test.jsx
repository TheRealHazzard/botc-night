import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScriptGamesPanel from './ScriptGamesPanel.jsx';

describe('ScriptGamesPanel', () => {
  it('shows "no games played yet" when decidedGames is 0', () => {
    render(<ScriptGamesPanel meta={{ decidedGames: 0 }} />);
    expect(screen.getByText('No games played yet')).toBeInTheDocument();
  });

  it('shows the games count and the good-win rate once games have decided', () => {
    render(<ScriptGamesPanel meta={{ decidedGames: 12, goodWins: 7, evilWins: 5 }} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('58%')).toBeInTheDocument();
    expect(screen.getByText('Good wins')).toBeInTheDocument();
    expect(screen.queryByText('42%')).not.toBeInTheDocument();
  });
});
