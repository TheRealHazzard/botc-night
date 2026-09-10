# BotC Night

An AI Storyteller for Blood on the Clocktower — runs the night, leaves the day to the humans.

One device (a laptop, a TV) runs the host/Storyteller screen. Everyone else joins from their own phone. The app deals roles, wakes each character in the correct order, delivers every player's private information, and tracks nominations/votes/executions — so a table can play a full game with no one sitting out to run it.

## Features

- **16 scripts** — the three official scripts (Trouble Brewing, Bad Moon Rising, Sects & Violets) plus 13 original custom scripts spanning every difficulty, including four Teensyville (5–7 player) scripts. 91 characters total. Browse the full roster for any script from the host's script picker before dealing.
- **A real night engine, not a script runner** — every character is one self-contained entry (target list, prompt text, resolution logic) in a shared registry, not a hand-maintained switch statement. Impairment (poisoned/drunk), protection, and death are each decided in exactly one place and reused by every character that needs them — see [`game/abilities/README.md`](game/abilities/README.md).
- **Player phones** — join by URL or QR code, get a private prompt each night, nominate/vote/claim during the day, and reconnect or reclaim a seat if a phone dies mid-game.
- **Bot-driven simulation** — spin up a full table of bots from the host screen to watch a script play out on its own, at any speed.
- **LAN HTTPS + installable PWA** — a real, trusted certificate for the local network (`npm run cert:lan`) so a phone can install the player app like a native one, no app store required.
- **Optional public hosting** via a Cloudflare Quick Tunnel (`npm run host:public`), for a table that isn't all on the same Wi-Fi.
- **Optional LLM-backed judgment** (off by default, needs `ANTHROPIC_API_KEY`) for the handful of abilities that genuinely need free-text judgment — Gossip's and Artist's claims, Savant's phrasing. Every other ability is fully deterministic and needs no LLM at all.

## Getting started

```bash
npm install
npm start          # http://localhost:3000
```

Open `/host` on the screen running the game. Players join at the LAN URL printed on startup, or by scanning the QR code shown on the host screen.

**Optional — real HTTPS on the LAN** (needed for a phone to install the app as a PWA):

```bash
npm run cert:lan    # once, needs mkcert on PATH
npm start           # now also serves HTTPS on :3443
```

**Optional — host from outside the LAN:**

```bash
npm run host:public # needs cloudflared on PATH
```

## Architecture

- **`server.js`** — the entire HTTP/SSE layer: one plain Node process, no framework, no database. All state lives in a single in-memory `game` object; every client (host and player) subscribes to it over Server-Sent Events and gets pushed a fresh view the moment anything changes.
- **`game/engine.js` + `game/helpers.js`** — the rules engine: dealing, night order, `promptFor`/`resolveNight`, win conditions, and every piece of logic shared across more than one character (`checkKill`, `pairInfo`, impairment, etc.).
- **`game/abilities/{tb,bmr,sv,carousel}.js`** — one entry per character, combined into a single registry by `game/abilities/index.js`. See [`game/abilities/README.md`](game/abilities/README.md) for the entry shape, and [`game/ABILITY_PATTERNS.md`](game/ABILITY_PATTERNS.md) for how an ability that reads like it "needs a human Storyteller" gets modeled without one.
- **`client/`** — two React entry points sharing one component library: the player app (`client/src/`) and the host/Storyteller dashboard (`client/src/host/`).

## Testing

This project treats the rules engine as something that has to be provably correct, not just "seems to work at the table":

| Command | What it checks |
|---|---|
| `npm run sim` | `tools/simulate.js` — hundreds of specific, hand-written assertions against real game states, covering every character and cross-cutting rule. |
| `node tools/audit-abilities.js` | A generic pass over *every* character in the built registry, checking the invariants that have actually caused real bugs — an impaired info role must never go silent, a decoy pool must never include the true answer, a night-order slot isn't the same as actually acting, a death's cause must always be tagged explicitly. This catches the next character to make the same mistake automatically, not just the ones already found. |
| `npm run test:player` | The full client component/hook test suite (`vitest`). |
| `npm run test:llm` | The optional LLM integration's defensive parsing — no real API key or network access needed. |
| `npm run test:dom-shim` | Lightweight integration smoke tests for the static host pages. |

Every rules or reliability bug found this way gets a permanent regression test alongside its fix — see the commit history for several rounds of systematic, independently-verified audits across the engine, the server, and the client.

## Status

Single-table, no accounts, no database — built for one physical table at a time. Player history/stats live in `data/` (gitignored) on whichever machine hosts the game.
