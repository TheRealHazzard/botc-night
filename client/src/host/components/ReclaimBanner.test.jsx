import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReclaimBanner from './ReclaimBanner.jsx';
import { mockFetch, lastBody } from '../../../test/fetchMock.js';

describe('ReclaimBanner', () => {
  it('renders nothing when there are no pending reclaims', () => {
    const { container } = render(<ReclaimBanner pendingReclaims={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one row per pending reclaim, independent of any phase context', () => {
    const pending = [
      { requestId: 'r1', name: 'Bo' },
      { requestId: 'r2', name: 'Cy' },
    ];
    render(<ReclaimBanner pendingReclaims={pending} />);
    expect(screen.getByText(/reconnect as bo/i)).toBeInTheDocument();
    expect(screen.getByText(/reconnect as cy/i)).toBeInTheDocument();
    expect(screen.getAllByText('Approve')).toHaveLength(2);
  });

  it('Approve posts the right requestId to /api/table/reclaim/approve', async () => {
    const fetchMock = mockFetch({ '/api/table/reclaim/approve': {} });
    const pending = [{ requestId: 'r1', name: 'Bo' }, { requestId: 'r2', name: 'Cy' }];
    render(<ReclaimBanner pendingReclaims={pending} />);
    await userEvent.click(screen.getAllByText('Approve')[1]); // Cy's row
    expect(lastBody(fetchMock, '/api/table/reclaim/approve')).toEqual({ requestId: 'r2' });
  });

  it('Deny posts the right requestId to /api/table/reclaim/deny', async () => {
    const fetchMock = mockFetch({ '/api/table/reclaim/deny': {} });
    const pending = [{ requestId: 'r1', name: 'Bo' }];
    render(<ReclaimBanner pendingReclaims={pending} />);
    await userEvent.click(screen.getByText('Deny'));
    expect(lastBody(fetchMock, '/api/table/reclaim/deny')).toEqual({ requestId: 'r1' });
  });

  it('the banner shrinks as pendingReclaims updates, e.g. after an approval clears one', () => {
    const pending = [{ requestId: 'r1', name: 'Bo' }, { requestId: 'r2', name: 'Cy' }];
    const { rerender, container } = render(<ReclaimBanner pendingReclaims={pending} />);
    rerender(<ReclaimBanner pendingReclaims={[{ requestId: 'r2', name: 'Cy' }]} />);
    expect(screen.queryByText(/reconnect as bo/i)).not.toBeInTheDocument();
    expect(screen.getByText(/reconnect as cy/i)).toBeInTheDocument();

    rerender(<ReclaimBanner pendingReclaims={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
