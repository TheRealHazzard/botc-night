import { useEffect, useState } from 'react';
import { post } from '../../lib/api.js';
import SimPicker from './SimPicker.jsx';
import RealJoin from './RealJoin.jsx';
import ColorPicker from './ColorPicker.jsx';
import WelcomeBackScreen from './WelcomeBackScreen.jsx';
import ReclaimPicker from './ReclaimPicker.jsx';
import ReclaimWaiting from './ReclaimWaiting.jsx';

/** Everything shown before a token exists — a small state machine
    (`screen.kind`) standing in for the vanilla version's chain of
    render*() functions calling each other directly. `screen.next`
    (colorPicker only) is a plain descriptor rather than a stored callback
    — {kind:'welcomeBack', stats} or null (meaning: join directly after
    choosing/skipping a color) — so nothing here holds a raw function in
    React state. */
export default function JoinFlow({ onJoined }) {
  const [screen, setScreen] = useState({ kind: 'loading' });

  useEffect(() => {
    fetch('/api/sim/seats').then(r => r.json()).then(seats => {
      setScreen(seats.length ? { kind: 'simPicker', seats } : { kind: 'realJoin', message: null });
    }).catch(() => setScreen({ kind: 'realJoin', message: null }));
  }, []);

  const doJoin = (name) => {
    return post('/api/join', { name }).then(r => {
      if (r.error) {
        setScreen({ kind: 'realJoin', message: r.error });
        return;
      }
      onJoined(r.token);
    });
  };

  const pickSimSeat = token => onJoined(token);

  const checkAgain = () => {
    setScreen({ kind: 'loading' });
    fetch('/api/sim/seats').then(r => r.json()).then(seats => {
      setScreen(seats.length ? { kind: 'simPicker', seats } : { kind: 'realJoin', message: null });
    }).catch(() => setScreen({ kind: 'realJoin', message: null }));
  };

  const pickProfile = name => doJoin(name);

  const submitName = name => {
    return fetch('/api/profile?name=' + encodeURIComponent(name)).then(r => r.json()).then(r => {
      // Anyone without a color yet gets offered one here — not just a
      // brand-new name. Most real profiles predate this feature, or the
      // player tapped "Skip for now" once; either way they'd otherwise
      // never see the picker again.
      if (r.found && !r.color) {
        setScreen({
          kind: 'colorPicker',
          name,
          next: (r.stats && r.stats.gamesPlayed) ? { kind: 'welcomeBack', stats: r.stats } : null,
        });
        return;
      }
      if (r.found && r.stats && r.stats.gamesPlayed) {
        setScreen({ kind: 'welcomeBack', name, stats: r.stats, color: r.color });
        return;
      }
      if (r.found) return doJoin(name);
      // A name nobody's used before — offer a color before the seat exists.
      setScreen({ kind: 'colorPicker', name, next: null });
    }).catch(() => doJoin(name));
  };

  const proceedFromColor = (name, next, color) => {
    if (!next) return doJoin(name);
    if (next.kind === 'welcomeBack') {
      setScreen({ kind: 'welcomeBack', name, stats: next.stats, color });
    }
  };

  const openReclaim = () => setScreen({ kind: 'reclaimPicker' });

  const requestReclaim = (targetId, name) => {
    post('/api/reclaim/request', { targetId }).then(r => {
      if (r.error) { setScreen({ kind: 'reclaimPicker' }); return; }
      setScreen({ kind: 'reclaimWaiting', requestId: r.requestId, name });
    });
  };

  switch (screen.kind) {
    case 'simPicker':
      return <SimPicker seats={screen.seats} onPickSeat={pickSimSeat} onCheckAgain={checkAgain} />;
    case 'realJoin':
      return (
        <RealJoin
          message={screen.message}
          onPickProfile={pickProfile}
          onSubmitName={submitName}
          onReclaim={openReclaim}
        />
      );
    case 'colorPicker':
      return (
        <ColorPicker
          name={screen.name}
          onProceed={color => proceedFromColor(screen.name, screen.next, color)}
        />
      );
    case 'welcomeBack':
      return (
        <WelcomeBackScreen
          name={screen.name}
          stats={screen.stats}
          color={screen.color}
          onTakeSeat={() => doJoin(screen.name)}
          onNotMe={() => setScreen({ kind: 'realJoin', message: null })}
        />
      );
    case 'reclaimPicker':
      return (
        <ReclaimPicker
          onRequestReclaim={requestReclaim}
          onBack={() => setScreen({ kind: 'realJoin', message: null })}
        />
      );
    case 'reclaimWaiting':
      return (
        <ReclaimWaiting
          requestId={screen.requestId}
          name={screen.name}
          onApproved={onJoined}
          onDenied={() => setScreen({ kind: 'realJoin', message: 'That request was denied. You can try again.' })}
          onExpired={() => setScreen({ kind: 'realJoin', message: 'That request expired — the table may have reset. You can try again.' })}
          onCancel={() => setScreen({ kind: 'reclaimPicker' })}
        />
      );
    default:
      return null; // loading
  }
}
