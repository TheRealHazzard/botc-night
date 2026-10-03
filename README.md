# BotC Night

An AI Storyteller for Blood on the Clocktower — runs the night, leaves the day to the humans.

One device (a laptop, a TV) runs the host/Storyteller screen. Everyone else joins from their own phone. The app deals roles, wakes each character in the correct order, delivers every player's private information, and tracks nominations/votes/executions — so a table can play a full game with no one sitting out to run it.

## Features

- **18 scripts** — the three official scripts (Trouble Brewing, Bad Moon Rising, Sects & Violets) plus 15 original custom scripts spanning every difficulty, including four Teensyville (5–7 player) scripts. 99 playable characters total. Browse the full roster for any script from the host's script picker before dealing.
- **A real night engine, not a script runner** — every character is one self-contained entry (target list, prompt text, resolution logic) in a shared registry, not a hand-maintained switch statement. Impairment (poisoned/drunk), protection, and death are each decided in exactly one place and reused by every character that needs them — see [`game/abilities/README.md`](game/abilities/README.md).
- **Player phones** — join by URL or QR code, get a private prompt each night, nominate/vote/claim during the day, and reconnect or reclaim a seat if a phone dies mid-game.
- **Bot-driven simulation** — spin up a full table of bots from the host screen to watch a script play out on its own, at any speed.
- **LAN HTTPS + installable PWA** — a real, trusted certificate for the local network (`npm run cert:lan`) so a phone can install the player app like a native one, no app store required.
- **Optional public hosting** via a Cloudflare Quick Tunnel (`npm run host:public`), for a table that isn't all on the same Wi-Fi.
- **Optional LLM-backed judgment** (off by default, needs `ANTHROPIC_API_KEY`) for the handful of abilities that genuinely need free-text judgment — Gossip's and Artist's claims, Savant's phrasing. Every other ability is fully deterministic and needs no LLM at all.

## Getting started

```bash
npm install
npm run build       # builds the player and host React apps into public/dist/ — needed once, and again after pulling client/ changes
npm start           # http://localhost:3000
```

Open `/host` on the screen running the game. Players join at the LAN URL printed on startup, or by scanning the QR code shown on the host screen.

(`public/dist/` is gitignored and build output, not checked in — `npm start` alone serves a 404 at `/` and `/host` until `npm run build` has been run at least once.)

**Optional — real HTTPS on the LAN** (needed for a phone to install the app as a PWA):

```bash
npm run cert:lan    # once, needs mkcert on PATH
npm start           # now also serves HTTPS on :3443
```

**Optional — host from outside the LAN:**

```bash
npm run host:public # needs cloudflared on PATH
```

**Optional — a desktop app for the host, no terminal needed** (Windows
only so far): a real window instead of a browser tab, wrapping this same
server unmodified — see [`ROADMAP.md`](ROADMAP.md) for the current state
of it and why it ships as a folder rather than an installer for now.

```bash
npm run build:app   # needs Rust + the Tauri CLI — see src-tauri/
```

Copy the resulting `dist-app/` folder anywhere and double-click
`BotC Night.exe`.

## Architecture

- **`server.js`** — the entire HTTP/SSE layer: one plain Node process, no framework, no database. All state lives in a single in-memory `game` object; every client (host and player) subscribes to it over Server-Sent Events and gets pushed a fresh view the moment anything changes.
- **`game/engine.js` + `game/helpers.js`** — the rules engine: dealing, night order, `promptFor`/`resolveNight`, win conditions, and every piece of logic shared across more than one character (`checkKill`, `pairInfo`, impairment, etc.).
- **`game/abilities/{tb,bmr,sv,carousel}.js`** — one entry per character, combined into a single registry by `game/abilities/index.js`. See [`game/abilities/README.md`](game/abilities/README.md) for the entry shape, and [`game/ABILITY_PATTERNS.md`](game/ABILITY_PATTERNS.md) for how an ability that reads like it "needs a human Storyteller" gets modeled without one.
- **`client/`** — two React entry points sharing one component library: the player app (`client/src/`) and the host/Storyteller dashboard (`client/src/host/`).

## Testing

This project treats both the rules engine *and* the server built on top of it as things that have to be provably correct, not just "seems to work at the table" — two different failure modes need two different kinds of test. An engine bug is the rules themselves being wrong; a wiring bug is `server.js` not calling the right thing on the right real path even though the rule underneath it is correct — the kind that only shows up once someone actually plays the game a specific way. Both real correctness bugs found in this project's history so far were the second kind, invisible to engine-level testing alone.

| Command | What it checks |
|---|---|
| `npm run sim` | `tools/simulate.js` — hundreds of specific, hand-written assertions against real game states, covering every character and cross-cutting rule. |
| `node tools/audit-abilities.js` | A generic pass over *every* character in the built registry, checking the invariants that have actually caused real bugs — an impaired info role must never go silent, a decoy pool must never include the true answer, a night-order slot isn't the same as actually acting, a death's cause must always be tagged explicitly. This catches the next character to make the same mistake automatically, not just the ones already found. |
| `npm run test:server` | Spawns the real `server.js` as a real child process (isolated temp data directory, ephemeral port) and drives it over real HTTP — a full game lifecycle end to end, plus permanent regression coverage for every wiring bug found so far. See `test/server/harness.js`. |
| `npm run test:history` | `game/history.js`'s recap/aggregate functions (closest vote, biggest swing, longest-surviving evil, pivotal moment, win streaks, ...) against plain constructed records — no real history data touched. |
| `npm run test:character-notes` | `game/characterNotes.js`'s "before you play" lookup — every real character resolves without throwing, and the handful of flagged ones return real, non-empty text. |
| `npm run test:player` | The full client component/hook test suite (`vitest`). |
| `npm run test:llm` | The optional LLM integration's defensive parsing — no real API key or network access needed. |
| `npm run test:nanoleaf` | The optional Nanoleaf lighting integration's request/response logic (mocked device) — no real panels needed. |
| `npm run test:dom-shim` | Lightweight integration smoke tests for the static host pages. |

Every rules or reliability bug found this way gets a permanent regression test alongside its fix — see the commit history for several rounds of systematic, independently-verified audits across the engine, the server, and the client.

## Security notes

A few things that look like gaps on a first read are deliberate, not missed — worth knowing before you self-host or fork this:

- **`TABLE_CODE`/`HOST_CODE` are off by default.** A plain `npm start` with neither set has no access gate at all — anyone who can reach the port can join or drive the table, same trust model as "whoever's on the same Wi-Fi." That's fine for a LAN game and becomes a real boundary only once the table is reachable from the open internet (see `npm run host:public`); set both env vars in that case. See `server.js`'s own comment right above `TABLE_CODE`'s definition for the full reasoning, and the rate limiter a few lines below it guarding against brute-forcing a short code.
- **`/recap` and `/api/recap` skip the access gate on purpose.** Both routes are structurally incapable of reading a live game — they only ever read `data/games.jsonl`, appended to once, after a game has already ended and been revealed. There's no code path from either route back to the live `game` object, so gating them adds no real protection, only friction for sharing a finished game's recap link. See `GATE_EXEMPT`'s own comment in `server.js`.
- **No accounts, no passwords, no server-side secrets beyond the two optional codes above.** Player "login" is just typing a name back in (`game/history.js`'s own comment: "no password, same trust the reclaim system already runs on") — appropriate for a table of people who know each other, not a substitute for real auth if this ever needs one.

## Status

Single-table, no accounts, no database — built for one physical table at a time. Player history/stats live in `data/` (gitignored) on whichever machine hosts the game.

See [`ROADMAP.md`](ROADMAP.md) for what's actually validated vs. code-complete-but-untested, named gaps, and the open scope questions for a 1.0.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) — the short version: read [`game/ABILITY_PATTERNS.md`](game/ABILITY_PATTERNS.md) and [`game/abilities/README.md`](game/abilities/README.md) before adding a character, and run the full test table above before opening a PR.

## License

[MIT](LICENSE).
