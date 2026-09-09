import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActiveVoteCard from './ActiveVoteCard.jsx';

function baseVote(overrides = {}) {
  return { nominationId: 'n1', nomineeName: 'Bo', windowEndsAt: Date.now() + 8000, isGhostVote: false, myChoice: null, stage: 'voting', ...overrides };
}

describe('ActiveVoteCard', () => {
  it('the locked stage shows a Reveal button that calls revealVote', async () => {
    const revealVote = vi.fn();
    render(<ActiveVoteCard activeVote={baseVote({ stage: 'locked' })} castVote={() => {}} revealVote={revealVote} ghostVoteEnabled={false} setGhostVoteEnabled={() => {}} />);
    expect(screen.getByText('Vote locked in.')).toBeInTheDocument();
    await userEvent.click(screen.getByText(/reveal my vote/i));
    expect(revealVote).toHaveBeenCalledTimes(1);
  });

  it('the voting stage shows Yes/No, highlights myChoice, and calls castVote', async () => {
    const castVote = vi.fn();
    render(<ActiveVoteCard activeVote={baseVote({ myChoice: 'yes' })} castVote={castVote} revealVote={() => {}} ghostVoteEnabled={false} setGhostVoteEnabled={() => {}} />);
    expect(screen.getByText('Yes')).toHaveClass('votebtn', 'yes', 'on');
    await userEvent.click(screen.getByText('No'));
    expect(castVote).toHaveBeenCalledWith('no');
  });

  it('a ghost vote disables Yes/No until armed via the toggle', async () => {
    const setGhostVoteEnabled = vi.fn();
    render(<ActiveVoteCard activeVote={baseVote({ isGhostVote: true })} castVote={() => {}} revealVote={() => {}} ghostVoteEnabled={false} setGhostVoteEnabled={setGhostVoteEnabled} />);
    expect(screen.getByText('Yes')).toBeDisabled();
    expect(screen.getByText('No')).toBeDisabled();
    expect(screen.getByText(/use my one ghost vote/i)).toBeInTheDocument();
    await userEvent.click(screen.getByText(/use my one ghost vote/i));
    expect(setGhostVoteEnabled).toHaveBeenCalled();
  });

  it('an armed ghost vote enables Yes/No and shows the armed copy', () => {
    render(<ActiveVoteCard activeVote={baseVote({ isGhostVote: true })} castVote={() => {}} revealVote={() => {}} ghostVoteEnabled setGhostVoteEnabled={() => {}} />);
    expect(screen.getByText('Yes')).toBeEnabled();
    expect(screen.getByText(/this is your only one, ever/i)).toBeInTheDocument();
  });

  it('the clock turns urgent at 5s or under', () => {
    render(<ActiveVoteCard activeVote={baseVote({ windowEndsAt: Date.now() + 4000 })} castVote={() => {}} revealVote={() => {}} ghostVoteEnabled={false} setGhostVoteEnabled={() => {}} />);
    expect(screen.getByText('4')).toHaveClass('clock', 'urgent');
  });
});
