import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RoomPacingNudge from './RoomPacingNudge.jsx';

describe('RoomPacingNudge', () => {
  it('renders nothing with no level', () => {
    const { container } = render(<RoomPacingNudge level={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the quiet copy, unstyled as "pressure"', () => {
    const { container } = render(<RoomPacingNudge level="quiet" />);
    expect(screen.getByText(/room's gone quiet/)).toBeInTheDocument();
    expect(container.querySelector('.room-pacing')).not.toHaveClass('pressure');
  });

  it('shows the pressure copy with the escalated class', () => {
    const { container } = render(<RoomPacingNudge level="pressure" />);
    expect(screen.getByText(/time to add some pressure/)).toBeInTheDocument();
    expect(container.querySelector('.room-pacing')).toHaveClass('pressure');
  });
});
