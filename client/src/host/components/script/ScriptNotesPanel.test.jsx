import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScriptNotesPanel from './ScriptNotesPanel.jsx';

describe('ScriptNotesPanel', () => {
  it('renders nothing at all when there are no notes — the overwhelmingly common case', () => {
    const { container: empty } = render(<ScriptNotesPanel notes={[]} />);
    expect(empty.firstChild).toBeNull();
    const { container: missing } = render(<ScriptNotesPanel />);
    expect(missing.firstChild).toBeNull();
  });

  it('shows the character name and note text for each entry', () => {
    render(<ScriptNotesPanel notes={[{ id: 'barber', name: 'Barber', note: 'Expect a second prompt the same night.' }]} />);
    expect(screen.getByText('Before you play')).toBeInTheDocument();
    expect(screen.getByText('Barber:')).toBeInTheDocument();
    expect(screen.getByText('Expect a second prompt the same night.')).toBeInTheDocument();
  });

  it('lists more than one note when a script has several', () => {
    render(<ScriptNotesPanel notes={[
      { id: 'barber', name: 'Barber', note: 'Note one.' },
      { id: 'someone', name: 'Someone Else', note: 'Note two.' },
    ]} />);
    expect(screen.getByText('Note one.')).toBeInTheDocument();
    expect(screen.getByText('Note two.')).toBeInTheDocument();
  });
});
