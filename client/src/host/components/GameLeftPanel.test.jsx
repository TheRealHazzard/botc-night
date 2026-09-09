import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameLeftPanel from './GameLeftPanel.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

const scriptChars = [{ id: 'imp', name: 'Imp', team: 'demon' }];
const activeScriptMeta = { id: 'tb', name: 'Trouble Brewing', difficulty: 1, description: 'x', decidedGames: 0 };

describe('GameLeftPanel', () => {
  beforeEach(() => mockFetch({ '/api/tokens': {} }));

  it('defaults to the Characters tab active, showing the roster and no script-view-panel', () => {
    const { container } = render(<GameLeftPanel scriptChars={scriptChars} activeScriptMeta={activeScriptMeta} />);
    expect(screen.getByText('Characters')).toHaveClass('active');
    expect(screen.getByText('Script')).not.toHaveClass('active');
    expect(container.querySelector('.script-view-panel')).not.toBeInTheDocument();
    expect(screen.getByText('In this script (1)')).toBeInTheDocument();
  });

  it('the Script tab shows the same ScriptViewPanel, locked (Change script disabled)', async () => {
    render(<GameLeftPanel scriptChars={scriptChars} activeScriptMeta={activeScriptMeta} />);
    await userEvent.click(screen.getByText('Script'));
    expect(screen.getByText('Script')).toHaveClass('active');
    expect(screen.getByText('Characters')).not.toHaveClass('active');
    expect(screen.getByText('Trouble Brewing')).toBeInTheDocument();
    expect(screen.getByText(/change script/i)).toBeDisabled();
  });

  it('tab-active state flips back correctly', async () => {
    render(<GameLeftPanel scriptChars={scriptChars} activeScriptMeta={activeScriptMeta} />);
    await userEvent.click(screen.getByText('Script'));
    await userEvent.click(screen.getByText('Characters'));
    expect(screen.getByText('Characters')).toHaveClass('active');
    expect(screen.getByText('In this script (1)')).toBeInTheDocument();
  });
});
