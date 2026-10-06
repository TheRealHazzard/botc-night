import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScriptViewPanel from './ScriptViewPanel.jsx';
import { mockFetch } from '../../../../test/fetchMock.js';

const meta = { id: 'tb', name: 'Trouble Brewing', difficulty: 1, description: 'The original.', decidedGames: 0 };

beforeEach(() => mockFetch({ '/api/tokens': {} }));

describe('ScriptViewPanel', () => {
  it('shows the script name and description, with an enabled Change script button by default', async () => {
    const onChangeScript = vi.fn();
    render(<ScriptViewPanel meta={meta} onChangeScript={onChangeScript} />);
    expect(screen.getByText('Trouble Brewing')).toBeInTheDocument();
    expect(screen.getByText('The original.')).toBeInTheDocument();
    const btn = screen.getByText(/change script/i);
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    expect(onChangeScript).toHaveBeenCalledTimes(1);
  });

  it('locked disables the button and never calls onChangeScript', async () => {
    const onChangeScript = vi.fn();
    render(<ScriptViewPanel meta={meta} locked onChangeScript={onChangeScript} />);
    const btn = screen.getByText(/change script/i);
    expect(btn).toBeDisabled();
    expect(btn).toHaveClass('ghostbtn');
  });

  it('omits "Build a script" when onBuildScript is not passed (the in-game/locked view)', () => {
    render(<ScriptViewPanel meta={meta} onChangeScript={() => {}} />);
    expect(screen.queryByText(/build a script/i)).not.toBeInTheDocument();
  });

  it('shows "Build a script" and calls it when passed', async () => {
    const onBuildScript = vi.fn();
    render(<ScriptViewPanel meta={meta} onChangeScript={() => {}} onBuildScript={onBuildScript} />);
    await userEvent.click(screen.getByText(/build a script/i));
    expect(onBuildScript).toHaveBeenCalledTimes(1);
  });

  it('omits the featured-role spotlight when the script has none', () => {
    render(<ScriptViewPanel meta={meta} onChangeScript={() => {}} />);
    expect(screen.queryByText('Featured Role')).not.toBeInTheDocument();
  });

  it('shows the featured-role spotlight when the script has one — in the locked, in-game state too', () => {
    const metaWithFeature = {
      ...meta,
      featuredCharacter: { id: 'vortox', name: 'Vortox', team: 'demon', ability: 'Everything registers wrong tonight.' },
    };
    render(<ScriptViewPanel meta={metaWithFeature} locked />);
    expect(screen.getByText('Featured Role')).toBeInTheDocument();
    expect(screen.getByText('Vortox')).toBeInTheDocument();
    expect(screen.getByText('Everything registers wrong tonight.')).toBeInTheDocument();
  });
});
