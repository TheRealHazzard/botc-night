import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NanoleafSection from './NanoleafSection.jsx';
import ToastStack from '../ToastStack.jsx';
import { mockFetch, lastBody } from '../../../../test/fetchMock.js';

describe('NanoleafSection', () => {
  it('shows "Not paired yet" and no paired list when nothing is saved', async () => {
    mockFetch({ '/api/nanoleaf/status': { devices: [] } });
    render(<NanoleafSection />);
    expect(await screen.findByText('Not paired yet.')).toHaveClass('llm-status', 'off');
    expect(screen.queryByText('Forget')).not.toBeInTheDocument();
  });

  it('shows every paired device with its own Forget action, and a pluralized count', async () => {
    mockFetch({
      '/api/nanoleaf/status': {
        devices: [
          { ip: '192.168.1.22', name: 'Shapes AD49' },
          { ip: '192.168.1.24', name: 'Lines C2C3' },
        ],
      },
    });
    render(<NanoleafSection />);
    expect(await screen.findByText('2 panel sets paired.')).toHaveClass('llm-status', 'ok');
    expect(screen.getByText('Shapes AD49')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.22')).toBeInTheDocument();
    expect(screen.getByText('Lines C2C3')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Forget' })).toHaveLength(2);
  });

  it('singular count with exactly one paired device', async () => {
    mockFetch({ '/api/nanoleaf/status': { devices: [{ ip: '192.168.1.22', name: 'Shapes AD49' }] } });
    render(<NanoleafSection />);
    expect(await screen.findByText('1 panel set paired.')).toHaveClass('llm-status', 'ok');
  });

  it('Forget posts the ip of the device it was clicked on', async () => {
    const fetchMock = mockFetch({
      '/api/nanoleaf/status': { devices: [{ ip: '192.168.1.22', name: 'Shapes AD49' }] },
      '/api/nanoleaf/forget': { ok: true },
    });
    render(<NanoleafSection />);
    await screen.findByText('Shapes AD49');

    await userEvent.click(screen.getByRole('button', { name: 'Forget' }));
    expect(lastBody(fetchMock, '/api/nanoleaf/forget')).toEqual({ ip: '192.168.1.22' });
  });

  it('Scan lists discovered devices, each with its own Pair button', async () => {
    mockFetch({
      '/api/nanoleaf/status': { devices: [] },
      '/api/nanoleaf/discover': {
        devices: [
          { ip: '192.168.1.140', port: 16021, name: 'Living Room Panels' },
          { ip: '192.168.1.150', port: 16021, name: 'Office Shapes' },
        ],
      },
    });
    render(<NanoleafSection />);
    await screen.findByText('Not paired yet.');

    await userEvent.click(screen.getByRole('button', { name: /scan for lights/i }));

    expect(await screen.findByText('Living Room Panels')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.140')).toBeInTheDocument();
    expect(screen.getByText('Office Shapes')).toBeInTheDocument();
    // The manual-fallback field's own Pair button, plus one per scan result.
    expect(screen.getAllByRole('button', { name: /^pair$/i })).toHaveLength(3);
  });

  it('a scan result already paired shows "Already paired" instead of a Pair button', async () => {
    mockFetch({
      '/api/nanoleaf/status': { devices: [{ ip: '192.168.1.140', name: 'Living Room Panels' }] },
      '/api/nanoleaf/discover': { devices: [{ ip: '192.168.1.140', port: 16021, name: 'Living Room Panels' }] },
    });
    render(<NanoleafSection />);
    await screen.findByText('1 panel set paired.');

    await userEvent.click(screen.getByRole('button', { name: /scan for lights/i }));

    expect(await screen.findByText('Already paired')).toBeInTheDocument();
    // Only the manual-fallback field's own Pair button remains.
    expect(screen.getAllByRole('button', { name: /^pair$/i })).toHaveLength(1);
  });

  it('clicking Pair on a scan result posts that device\'s ip and name', async () => {
    const fetchMock = mockFetch({
      '/api/nanoleaf/status': { devices: [] },
      '/api/nanoleaf/discover': { devices: [{ ip: '192.168.1.140', port: 16021, name: 'Living Room Panels' }] },
      '/api/nanoleaf/pair': { ok: true },
    });
    render(<NanoleafSection />);
    await screen.findByText('Not paired yet.');
    await userEvent.click(screen.getByRole('button', { name: /scan for lights/i }));
    await screen.findByText('Living Room Panels');

    const deviceRow = screen.getByText('Living Room Panels').closest('.nanoleaf-device');
    await userEvent.click(within(deviceRow).getByRole('button', { name: /^pair$/i }));

    expect(lastBody(fetchMock, '/api/nanoleaf/pair')).toEqual({ ip: '192.168.1.140', name: 'Living Room Panels' });
  });

  it('Scan finding nothing shows a helpful message instead of an empty list', async () => {
    mockFetch({
      '/api/nanoleaf/status': { devices: [] },
      '/api/nanoleaf/discover': { devices: [] },
    });
    render(<NanoleafSection />);
    await screen.findByText('Not paired yet.');

    await userEvent.click(screen.getByRole('button', { name: /scan for lights/i }));

    expect(await screen.findByText(/no nanoleaf devices answered/i)).toBeInTheDocument();
  });

  it('the manual IP field posts with no name, and clears on success', async () => {
    const fetchMock = mockFetch({
      '/api/nanoleaf/status': { devices: [] },
      '/api/nanoleaf/pair': { ok: true },
    });
    render(<NanoleafSection />);
    await screen.findByText('Not paired yet.');

    await userEvent.type(screen.getByPlaceholderText('192.168.1.45'), '  10.0.0.5  ');
    await userEvent.click(screen.getByRole('button', { name: /^pair$/i }));

    expect(lastBody(fetchMock, '/api/nanoleaf/pair')).toEqual({ ip: '10.0.0.5', name: null });
    expect(screen.getByPlaceholderText('192.168.1.45')).toHaveValue('');
  });

  it('Pair with an empty IP field never posts', async () => {
    const fetchMock = mockFetch({ '/api/nanoleaf/status': { devices: [] } });
    render(<><NanoleafSection /><ToastStack /></>);
    await screen.findByText('Not paired yet.');

    await userEvent.click(screen.getByRole('button', { name: /^pair$/i }));

    expect(await screen.findByText(/enter the panels' ip address first/i)).toBeInTheDocument();
    expect(fetchMock.calls.some(c => c.url.includes('/api/nanoleaf/pair'))).toBe(false);
  });

  it('a failed pairing attempt surfaces the error and never adds to the paired list', async () => {
    mockFetch({
      '/api/nanoleaf/status': { devices: [] },
      '/api/nanoleaf/pair': { ok: false, error: 'pairing-window-closed' },
    });
    render(<><NanoleafSection /><ToastStack /></>);
    await screen.findByText('Not paired yet.');

    await userEvent.type(screen.getByPlaceholderText('192.168.1.45'), '10.0.0.5');
    await userEvent.click(screen.getByRole('button', { name: /^pair$/i }));

    expect(await screen.findByText(/pairing window closed/i)).toBeInTheDocument();
    expect(screen.getByText('Not paired yet.')).toHaveClass('llm-status', 'off');
  });

  it('an unrecognized failure reason still surfaces the raw code, not a silent generic message', async () => {
    mockFetch({
      '/api/nanoleaf/status': { devices: [] },
      '/api/nanoleaf/pair': { ok: false, error: 'http-500' },
    });
    render(<><NanoleafSection /><ToastStack /></>);
    await screen.findByText('Not paired yet.');

    await userEvent.type(screen.getByPlaceholderText('192.168.1.45'), '10.0.0.5');
    await userEvent.click(screen.getByRole('button', { name: /^pair$/i }));

    expect(await screen.findByText('Pairing failed (http-500).')).toBeInTheDocument();
  });
});
