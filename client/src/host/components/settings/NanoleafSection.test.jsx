import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NanoleafSection from './NanoleafSection.jsx';
import ToastStack from '../ToastStack.jsx';
import { mockFetch, lastBody } from '../../../../test/fetchMock.js';

describe('NanoleafSection', () => {
  it('shows "Not paired yet" and an empty IP field when nothing is saved', async () => {
    mockFetch({ '/api/nanoleaf/status': { paired: false, ip: null } });
    render(<NanoleafSection />);
    expect(await screen.findByText('Not paired yet.')).toHaveClass('llm-status', 'off');
    expect(screen.getByPlaceholderText('192.168.1.45')).toHaveValue('');
  });

  it('shows the saved IP and "Paired" status, pre-filling the field from it', async () => {
    mockFetch({ '/api/nanoleaf/status': { paired: true, ip: '192.168.1.45' } });
    render(<NanoleafSection />);
    const status = await screen.findByText('Paired — 192.168.1.45');
    expect(status).toHaveClass('llm-status', 'ok');
    expect(screen.getByPlaceholderText('192.168.1.45')).toHaveValue('192.168.1.45');
  });

  it('Pair posts the trimmed IP and flips to paired on success', async () => {
    const fetchMock = mockFetch({
      '/api/nanoleaf/status': { paired: false, ip: null },
      '/api/nanoleaf/pair': { ok: true },
    });
    render(<NanoleafSection />);
    await screen.findByText('Not paired yet.');

    await userEvent.type(screen.getByPlaceholderText('192.168.1.45'), '  10.0.0.5  ');
    await userEvent.click(screen.getByRole('button', { name: /^pair$/i }));

    expect(lastBody(fetchMock, '/api/nanoleaf/pair')).toEqual({ ip: '10.0.0.5' });
    expect(await screen.findByText('Paired — 10.0.0.5')).toHaveClass('llm-status', 'ok');
  });

  it('a failed pairing attempt surfaces the error and leaves status unpaired', async () => {
    mockFetch({
      '/api/nanoleaf/status': { paired: false, ip: null },
      '/api/nanoleaf/pair': { ok: false, error: 'pairing-window-closed' },
    });
    render(<><NanoleafSection /><ToastStack /></>);
    await screen.findByText('Not paired yet.');

    await userEvent.type(screen.getByPlaceholderText('192.168.1.45'), '10.0.0.5');
    await userEvent.click(screen.getByRole('button', { name: /^pair$/i }));

    expect(await screen.findByText(/pairing window closed/i)).toBeInTheDocument();
    expect(screen.getByText('Not paired yet.')).toHaveClass('llm-status', 'off');
  });

  it('Pair with an empty IP field never posts', async () => {
    const fetchMock = mockFetch({ '/api/nanoleaf/status': { paired: false, ip: null } });
    render(<><NanoleafSection /><ToastStack /></>);
    await screen.findByText('Not paired yet.');

    await userEvent.click(screen.getByRole('button', { name: /^pair$/i }));

    expect(await screen.findByText(/enter the panels' ip address first/i)).toBeInTheDocument();
    expect(fetchMock.calls.some(c => c.url.includes('/api/nanoleaf/pair'))).toBe(false);
  });
});
