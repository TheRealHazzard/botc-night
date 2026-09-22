import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SimulateOverlay from './SimulateOverlay.jsx';
import { mockFetch } from '../../../test/fetchMock.js';

class FakeEventSource {
  constructor(url) {
    FakeEventSource.instances.push(this);
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.closed = false;
    this.listeners = {};
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(data) { this.onmessage && this.onmessage({ data: JSON.stringify(data) }); }
  close() { this.closed = true; }
}
FakeEventSource.instances = [];

const payload = {
  table: { phase: 'night', nightNumber: 1, wave: 1, players: [{ alive: true, submitted: false }], windowEndsAt: null },
  seats: [
    {
      you: { id: 'p1', name: 'Ava', alive: true, ghostVoteUsed: false, character: { id: 'chef', name: 'Chef', team: 'townsfolk', ability: 'x' } },
      trueCharacterId: 'chef', trueCharacter: 'Chef', statuses: [], prompt: null, submitted: false, result: null,
    },
  ],
  log: [{ night: 1, text: 'Night 1 begins.', secret: false }],
  llmLog: [],
};

describe('SimulateOverlay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeEventSource.instances = [];
  });

  it('shows the start form when no simulation is running (the probe fails)', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    globalThis.fetch = url => (String(url).includes('/api/scripts') ? Promise.resolve({ ok: true, json: () => Promise.resolve([]) }) : Promise.resolve({ ok: false, status: 403 }));
    render(<SimulateOverlay onClose={() => {}} realPhase="lobby" realPlayerCount={0} />);
    expect(await screen.findByRole('button', { name: /run a game/i })).toBeInTheDocument();
  });

  it('switches to the live dashboard once the sim stream delivers a payload', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    mockFetch({ '/sim-events': {}, '/api/scripts': [] });
    render(<SimulateOverlay onClose={() => {}} realPhase="lobby" realPlayerCount={0} />);

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    FakeEventSource.instances[0].emit(payload);

    expect(await screen.findByText('Ava')).toBeInTheDocument();
    expect(screen.getByText('Chef')).toBeInTheDocument();
    expect(screen.getByText(/Night 1 begins\./)).toBeInTheDocument();
    expect(screen.getByText(/nothing sent yet/i)).toBeInTheDocument(); // empty LLM log
  });

  it('switching to Player view shows the focused seat\'s believed-state phone mockup', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    mockFetch({ '/sim-events': {}, '/api/scripts': [] });
    render(<SimulateOverlay onClose={() => {}} realPhase="lobby" realPlayerCount={0} />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    FakeEventSource.instances[0].emit(payload);
    await screen.findByText('Ava');

    await userEvent.click(screen.getByRole('button', { name: 'Player view' }));
    expect(screen.getByText('Blood On The Clocktower')).toBeInTheDocument();
    expect(screen.getByText('townsfolk')).toBeInTheDocument();
  });

  it('clicking a seat card in Observer mode jumps straight to that seat in Player view', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    mockFetch({ '/sim-events': {}, '/api/scripts': [] });
    render(<SimulateOverlay onClose={() => {}} realPhase="lobby" realPlayerCount={0} />);
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    FakeEventSource.instances[0].emit(payload);
    await screen.findByText('Ava');

    await userEvent.click(screen.getByText('Ava'));
    expect(screen.getByText('Blood On The Clocktower')).toBeInTheDocument();
  });

  it('calls onClose when Close is clicked', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    globalThis.fetch = () => Promise.resolve({ ok: false, status: 403 });
    let closed = false;
    render(<SimulateOverlay onClose={() => { closed = true; }} realPhase="lobby" realPlayerCount={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toBe(true);
  });
});
