import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VoteRevealOverlay from './VoteRevealOverlay.jsx';

describe('VoteRevealOverlay', () => {
  it('renders nothing when there is no active vote, or it is not yet revealed', () => {
    const { container, rerender } = render(<VoteRevealOverlay activeVote={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<VoteRevealOverlay activeVote={{ stage: 'voting', myChoice: null, nomineeName: 'Bo' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows YES / NO / NO VOTE with the matching color class once revealed', () => {
    const { rerender } = render(<VoteRevealOverlay activeVote={{ stage: 'revealed', myChoice: 'yes', nomineeName: 'Bo' }} />);
    expect(screen.getByText('YES').closest('.reveal-overlay')).toHaveClass('yes');
    expect(screen.getByText('on Bo')).toBeInTheDocument();

    rerender(<VoteRevealOverlay activeVote={{ stage: 'revealed', myChoice: 'no', nomineeName: 'Cy' }} />);
    expect(screen.getByText('NO').closest('.reveal-overlay')).toHaveClass('no');

    rerender(<VoteRevealOverlay activeVote={{ stage: 'revealed', myChoice: null, nomineeName: 'Di' }} />);
    expect(screen.getByText('NO VOTE').closest('.reveal-overlay')).toHaveClass('none');
  });
});
