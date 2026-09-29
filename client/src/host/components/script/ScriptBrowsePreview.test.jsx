import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScriptBrowsePreview from './ScriptBrowsePreview.jsx';
import { mockFetch } from '../../../../test/fetchMock.js';

describe('ScriptBrowsePreview', () => {
  it('shows the script name, difficulty, character count, and description', () => {
    const meta = { id: 'bmr', name: 'Bad Moon Rising', difficulty: 2, characterCount: 25, description: 'Trust no one.', playable: true };
    render(<ScriptBrowsePreview meta={meta} />);
    expect(screen.getByText('Bad Moon Rising')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('25 characters')).toBeInTheDocument();
    expect(screen.getByText('Trust no one.')).toBeInTheDocument();
    expect(screen.queryByText('Soon')).not.toBeInTheDocument();
  });

  it('a locked script shows the "Soon" badge — same wording as the list row\'s tag', () => {
    const meta = { id: 'lunar-eclipse', name: 'Lunar Eclipse', difficulty: 4, playable: false, description: 'x' };
    render(<ScriptBrowsePreview meta={meta} />);
    expect(screen.getByText('Soon')).toBeInTheDocument();
  });

  it('omits the character count line when not provided', () => {
    const meta = { id: 'custom', name: 'Custom', difficulty: 1, description: 'x' };
    render(<ScriptBrowsePreview meta={meta} />);
    expect(screen.queryByText(/characters$/)).not.toBeInTheDocument();
  });

  it('shows the games record below the description', () => {
    const meta = { id: 'bmr', name: 'Bad Moon Rising', difficulty: 2, description: 'x', decidedGames: 4, goodWins: 3, evilWins: 1 };
    render(<ScriptBrowsePreview meta={meta} />);
    const desc = screen.getByText('x');
    const gamesTitle = screen.getByText('No of games');
    // DOM order check: description comes before the games panel.
    expect(desc.compareDocumentPosition(gamesTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('omits the featured role section when the script has none', () => {
    const meta = { id: 'custom', name: 'Custom', difficulty: 1, description: 'x' };
    render(<ScriptBrowsePreview meta={meta} />);
    expect(screen.queryByText('Featured Role')).not.toBeInTheDocument();
  });

  it('omits the notes section when the script has none', () => {
    const meta = { id: 'custom', name: 'Custom', difficulty: 1, description: 'x' };
    render(<ScriptBrowsePreview meta={meta} />);
    expect(screen.queryByText('Before you play')).not.toBeInTheDocument();
  });

  it('shows notes between the description and the featured role', () => {
    mockFetch({ '/api/tokens': {} });
    const meta = {
      id: 'sv', name: 'Sects & Violets', difficulty: 3, description: 'x',
      notes: [{ id: 'barber', name: 'Barber', note: 'Expect a second prompt the same night.' }],
      featuredCharacter: { id: 'vortox', name: 'Vortox', team: 'demon', ability: 'y' },
    };
    render(<ScriptBrowsePreview meta={meta} />);
    const desc = screen.getByText('x');
    const notesTitle = screen.getByText('Before you play');
    const featuredTitle = screen.getByText('Featured Role');
    expect(desc.compareDocumentPosition(notesTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notesTitle.compareDocumentPosition(featuredTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Expect a second prompt the same night.')).toBeInTheDocument();
  });

  it('shows the featured role between the description and the games record', () => {
    mockFetch({ '/api/tokens': {} });
    const meta = {
      id: 'lunar-eclipse', name: 'Lunar Eclipse', difficulty: 4, description: 'x',
      featuredCharacter: { id: 'lunatic', name: 'Lunatic', team: 'outsider', ability: 'You think you are a Demon, but you are not.' },
    };
    render(<ScriptBrowsePreview meta={meta} />);
    const desc = screen.getByText('x');
    const featuredTitle = screen.getByText('Featured Role');
    const gamesTitle = screen.getByText('No of games');
    expect(desc.compareDocumentPosition(featuredTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(featuredTitle.compareDocumentPosition(gamesTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Lunatic')).toBeInTheDocument();
    expect(screen.getByText(meta.featuredCharacter.ability)).toBeInTheDocument();
  });
});
