import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultCard from './ResultCard.jsx';

describe('ResultCard', () => {
  it('reveals title, body, and a plain names list', async () => {
    render(<ResultCard result={{ title: 'You learn:', body: 'Two of these are evil.', names: ['Bo', 'Cy'] }} />);
    await userEvent.click(screen.getByText(/hold to read/i));
    expect(screen.getByText('You learn:')).toBeInTheDocument();
    expect(screen.getByText('Two of these are evil.')).toBeInTheDocument();
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.getByText('Cy')).toBeInTheDocument();
  });

  it('renders a grimoire list with believed character, dead, and status annotations', async () => {
    const result = {
      title: 'The truth',
      body: 'Everyone, exactly.',
      grimoire: [
        { name: 'Ada', character: 'Empath', alive: true, believedCharacter: null, statuses: [] },
        { name: 'Bo', character: 'Imp', alive: false, believedCharacter: 'Butler', statuses: ['poisoned'] },
      ],
    };
    render(<ResultCard result={result} />);
    await userEvent.click(screen.getByText(/hold to read/i));
    expect(screen.getByText(/Ada — Empath/)).toBeInTheDocument();
    expect(screen.getByText(/Bo — Imp \(believes: Butler\) \(dead\) \[poisoned\]/)).toBeInTheDocument();
  });
});
