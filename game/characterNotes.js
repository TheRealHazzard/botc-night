'use strict';

/* "Before you play" notes — a deliberate app behavior a character's real
   card text alone wouldn't tell a table to expect, surfaced once while
   browsing a script (server.js's /api/scripts, client's ScriptBrowsePreview),
   before anyone's committed to playing it. Not a rules explainer — the
   card/ability text (characters.json) already covers that — specifically
   the gap between what a table used to physical play expects and what
   this app actually does differently.

   Kept deliberately separate from characters.json: that file is straight
   official card data (id/name/ability/night-order/reminders — every field
   in it matches the printed sheet, see characters.json's own comment-free
   uniformity), and mixing app-specific commentary into it would make it a
   worse mirror of the source it's meant to match.

   Grows one entry at a time, same spirit as MERCY_ELIGIBLE_IDS
   (game/helpers.js) or PIVOTAL_KIND_RANK (game/history.js) — add a
   character here only once there's a real, specific gap worth flagging
   (a real report, a real point of confusion at a real table), not
   preemptively for every character an app implementation happens to
   touch at all. */
const CHARACTER_NOTES = {
  // The real report: a Demon killing the Barber used to leave a real
  // player unexpectedly out of time for the swap prompt that followed —
  // see game/abilities/tb.js's own comment on the Ravenkeeper, the other
  // half of that investigation. The Barber's own case stayed on the same
  // night deliberately (the Demon is alive and already paying attention,
  // not someone processing their own death), but a table used to the
  // physical game — where a human Storyteller just quietly wakes the
  // Demon a second time within the same night's flow — has no reason to
  // expect a *second, separately timed* window here. Worth knowing before
  // the Barber's even in play, not discovered mid-game.
  barber: 'If the Demon kills the Barber, the Demon is woken again immediately, later the same night, for a second timed prompt to make the swap — expect it, rather than being caught off guard.',
};

/** null for a character with nothing worth flagging — the overwhelmingly
    common case, so every caller checks for that rather than assuming an
    entry exists. */
function noteFor(characterId) {
  return CHARACTER_NOTES[characterId] || null;
}

module.exports = { CHARACTER_NOTES, noteFor };
