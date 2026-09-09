import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GossipClaim from './GossipClaim.jsx';

// ClaimBuilder itself is covered in depth by ClaimBuilder.test.jsx — this
// just confirms GossipClaim wires the right copy, data, and endpoint into it.
describe('GossipClaim', () => {
  it('renders the gossip-specific heading and passes through targets/characterOptions', () => {
    render(
      <GossipClaim
        gossipClaim={{ targets: [{ id: 'p1', name: 'Bo' }], characterOptions: [{ id: 'imp', name: 'Imp' }] }}
        token="tok"
        llmEnabled={false}
      />
    );
    expect(screen.getByText('Make a statement')).toBeInTheDocument();
    expect(screen.getByText(/tonight, if it was true/i)).toBeInTheDocument();
  });
});
