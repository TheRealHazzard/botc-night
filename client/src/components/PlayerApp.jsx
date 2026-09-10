import { useEffect, useState } from 'react';
import RoleCard from './game/RoleCard.jsx';
import ResultCard from './game/ResultCard.jsx';
import { LobbyCard, RevealCard, NightWaitingCard, DaylightCard } from './game/SimpleCards.jsx';
import NightPromptCard from './game/NightPromptCard.jsx';
import SingleTargetChoice from './game/SingleTargetChoice.jsx';
import SimpleActionPrompt from './game/SimpleActionPrompt.jsx';
import GossipClaim from './game/GossipClaim.jsx';
import ArtistQuestion from './game/ArtistQuestion.jsx';
import JugglerGuess from './game/JugglerGuess.jsx';
import ActiveVoteCard from './game/ActiveVoteCard.jsx';
import VoteRevealOverlay from './VoteRevealOverlay.jsx';
import { useActiveVote } from '../hooks/useActiveVote.js';

/** Mirrors the vanilla render() function's composition exactly: several
    independent cards can be visible at once (a role hold-to-reveal, a
    result, a death banner) alongside whichever single "thing that needs
    doing right now" card is active. The day-phase action prompts
    (nominate/slayer/gossip/juggler/savant/artist/plain-daylight) are
    mutually exclusive in the data itself — the server only ever sets one
    at a time — so they're written as a plain if/else-if chain here too. */
export default function PlayerApp({ P, token, onChangeUser }) {
  const { activeVote, castVote, revealVote, ghostVoteEnabled, setGhostVoteEnabled } = useActiveVote(P, token);

  // Nominating is the one day-phase prompt that isn't server-pushed — a
  // player opts into it themselves from DaylightCard, so it needs its own
  // toggle here rather than reading off a P field the way every other
  // prompt does. Reset the moment canNominate goes away out from under
  // them (someone else's nomination just opened elsewhere) — the same
  // "the moment's passed, don't leave a stale prompt up" rule
  // useActiveVote.js already follows for its own overlay.
  const [nominating, setNominating] = useState(false);
  useEffect(() => {
    if (!P.canNominate) setNominating(false);
  }, [P.canNominate]);

  const choosingTarget =
    (P.phase === 'night' && P.prompt && !P.submitted) ||
    !!P.moonchildChoice || !!P.klutzChoice || !!P.madClaim ||
    (P.phase === 'day' && (nominating || !!P.slayerShot || !!P.gossipClaim || !!P.jugglerGuess || !!P.savantVisit || !!P.artistQuestion));

  return (
    <>
      {P.watching && (
        <div className="watch-banner">
          Watching a simulation as {P.you.name}. Bots decide everything here — this phone can only look.
        </div>
      )}

      {!P.you.alive && (
        <div className={'dead-banner' + (P.you.ghostVoteUsed ? ' spent' : '')}>
          {P.you.ghostVoteUsed
            ? 'You are dead and your vote is spent. You may still speak.'
            : 'You are dead. You still have a voice, and one vote left.'}
        </div>
      )}

      {!choosingTarget && <RoleCard character={P.you.character} />}

      {P.phase === 'lobby' && <LobbyCard name={P.you.name} onChangeUser={onChangeUser} />}
      {P.phase === 'reveal' && <RevealCard />}

      {P.phase === 'night' && P.prompt && (
        <NightPromptCard key={`${P.nightNumber}:${P.wave}`} P={P} token={token} />
      )}
      {P.phase === 'night' && !P.prompt && P.you.alive && <NightWaitingCard />}

      {P.result && <ResultCard result={P.result} />}

      {P.moonchildChoice && (
        <SingleTargetChoice
          title="The Moonchild"
          description="You have died. Publicly choose a player — if they are good, they die alongside you. Announce it out loud before you tap Choose."
          targets={P.moonchildChoice.targets}
          buttonLabel="Choose"
          endpoint="/api/moonchild-choice"
          token={token}
          onDone={() => {}}
        />
      )}

      {P.klutzChoice && (
        <SingleTargetChoice
          title="The Klutz"
          description="You have died. Publicly choose a player right now — if they are evil, your team loses. Announce it out loud before you tap Choose."
          targets={P.klutzChoice.targets}
          buttonLabel="Choose"
          endpoint="/api/klutz-choice"
          token={token}
          onDone={() => {}}
        />
      )}

      {P.madClaim && (
        <SimpleActionPrompt
          title='You are "mad"'
          description={`Say out loud, right now, that you are ${P.madClaim.label} — or you might be executed for it before tonight is over.`}
          buttonLabel="Claim it"
          endpoint="/api/mad-claim"
          token={token}
        />
      )}

      {activeVote && activeVote.stage !== 'revealed' && (
        <ActiveVoteCard
          activeVote={activeVote}
          castVote={castVote}
          revealVote={revealVote}
          ghostVoteEnabled={ghostVoteEnabled}
          setGhostVoteEnabled={setGhostVoteEnabled}
        />
      )}

      {P.phase === 'day' && nominating && P.canNominate ? (
        <SingleTargetChoice
          title="Nominate"
          description="Choose who you want to nominate for execution today."
          targets={P.canNominate.targets}
          buttonLabel="Nominate"
          endpoint="/api/table/nominate"
          token={token}
          onDone={() => setNominating(false)}
        />
      ) : P.phase === 'day' && P.slayerShot ? (
        <SingleTargetChoice
          title="The Slayer's shot"
          description="Once per game. Publicly choose a player — if they are the Demon, they die. Announce it out loud before you tap Fire."
          targets={P.slayerShot.targets}
          buttonLabel="Fire"
          endpoint="/api/slayer-shot"
          token={token}
          onDone={() => {}}
        />
      ) : P.phase === 'day' && P.gossipClaim ? (
        <GossipClaim gossipClaim={P.gossipClaim} token={token} llmEnabled={P.llmEnabled} />
      ) : P.phase === 'day' && P.jugglerGuess ? (
        <JugglerGuess jugglerGuess={P.jugglerGuess} token={token} />
      ) : P.phase === 'day' && P.savantVisit ? (
        <SimpleActionPrompt
          title="Visit the Storyteller"
          description="Once per day. You'll be told two things — one true, one false — and not which is which."
          buttonLabel="Visit"
          endpoint="/api/savant-visit"
          token={token}
        />
      ) : P.phase === 'day' && P.artistQuestion ? (
        <ArtistQuestion artistQuestion={P.artistQuestion} token={token} llmEnabled={P.llmEnabled} />
      ) : P.phase === 'day' && !activeVote ? (
        <DaylightCard canNominate={!!P.canNominate} onNominate={() => setNominating(true)} />
      ) : null}

      <VoteRevealOverlay activeVote={activeVote} />
    </>
  );
}
