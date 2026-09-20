import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultCard from './ResultCard.jsx';

describe('ResultCard', () => {
  it('reveals title, body, and a plain names list when there is no kind (most abilities, unmigrated)', async () => {
    render(<ResultCard result={{ title: 'You learn:', body: 'Two of these are evil.', names: ['Bo', 'Cy'] }} />);
    await userEvent.click(screen.getByText(/hold to read/i));
    expect(screen.getByText('You learn:')).toBeInTheDocument();
    expect(screen.getByText('Two of these are evil.')).toBeInTheDocument();
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.getByText('Cy')).toBeInTheDocument();
    expect(document.querySelector('.result-pointer')).not.toBeInTheDocument();
  });

  it('kind:count shows a number badge alongside the sentence', async () => {
    render(<ResultCard result={{ title: 'Empath', kind: 'count', count: 1, body: 'Evil living neighbours: 1' }} />);
    await userEvent.click(screen.getByText(/hold to read/i));
    expect(screen.getByText('Evil living neighbours: 1')).toBeInTheDocument();
    expect(screen.getByText('1', { selector: '.result-count' })).toBeInTheDocument();
  });

  it('kind:yesno shows a Yes/no chip, colored by the answer', async () => {
    const { rerender } = render(<ResultCard result={{ title: 'Fortune Teller', kind: 'yesno', yes: true, body: 'Yes — one of them is the Demon.' }} />);
    await userEvent.click(screen.getByText(/hold to read/i));
    expect(screen.getByText('Yes', { selector: '.result-yesno' })).toHaveClass('yes');

    rerender(<ResultCard result={{ title: 'Fortune Teller', kind: 'yesno', yes: false, body: 'No — neither is the Demon.' }} />);
    expect(screen.getByText('No', { selector: '.result-yesno' })).toHaveClass('no');
  });

  it('kind:pointer highlights named players instead of a plain bullet list', async () => {
    render(<ResultCard result={{ title: 'Washerwoman', kind: 'pointer', names: ['Bo', 'Cy'], body: 'One of these two players is the Chef.' }} />);
    await userEvent.click(screen.getByText(/hold to read/i));
    const pointer = document.querySelector('.result-pointer');
    expect(pointer).toBeInTheDocument();
    expect(pointer.querySelectorAll('.result-pointer-name')).toHaveLength(2);
    expect(document.querySelector('.result ul')).not.toBeInTheDocument(); // not the plain-list fallback
  });

  it('kind:grimoire renders believed character, dead, and status tags', async () => {
    const result = {
      title: 'The truth',
      kind: 'grimoire',
      body: 'Everyone, exactly.',
      grimoire: [
        { name: 'Ada', character: 'Empath', alive: true, believedCharacter: null, statuses: [] },
        { name: 'Bo', character: 'Imp', alive: false, believedCharacter: 'Butler', statuses: ['poisoned'] },
      ],
    };
    render(<ResultCard result={result} />);
    await userEvent.click(screen.getByText(/hold to read/i));
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Empath')).toBeInTheDocument();
    expect(screen.getByText('Imp (believes: Butler)')).toBeInTheDocument();
    expect(screen.getByText('dead')).toBeInTheDocument();
    expect(screen.getByText('poisoned')).toBeInTheDocument();
  });
});
