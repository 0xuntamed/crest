# Crest: proof a human wrote it

AI detectors guess, and they wrongly flag real writers. Crest takes the opposite approach. Write in Crest, and every
keystroke goes into a **hash-chained, server-witnessed log**. When you **seal** a piece, the server replays the whole
log, grades it with **fixed public rules**, and signs it with **Ed25519**. Anyone can open the crest page, watch a
keystroke replay, see every pasted character highlighted, and re-run every check in their own browser.

Nothing is probabilistic: the same log always produces the same text, metrics, tier, slug and seal artwork.

## Features

| | |
|---|---|
| **Editor** (`/write/:id`) | Calm writing surface. Each edit becomes a `[t, pos, del, ins, kind]` splice. kind is typed, pasted, or other (undo/autocorrect/predictive). Text inserted without a keystroke is never counted as typed. |
| **Chain** | Every ~1.2s the browser sends a batch. The server replays it against its own copy, stamps it with server time, and stores `sha256(prev ∥ seq ∥ server_ms ∥ events_json)`. |
| **Witnessing** | A batch counts as "witnessed" only if the time the client claims fits inside the time the server saw pass (±10s). A forged log uploaded all at once fails. |
| **Seal** | Full replay from genesis → metrics → tier → Ed25519 signature. The slug is the first 12 hex digits of the chain head. |
| **Crest page** (`/c/:slug`) | Generative wax seal (made from the hash), facts, origin bar, keystroke-rhythm histogram, growth curve, origin-highlighted text, scrub-able replay, in-browser verifier, embeddable badge, raw log download. |
| **Verify** (`/verify`) | Paste any text to find its crest. Matching ignores case, quotes and whitespace; a paragraph of 60+ characters can match a longer piece. |
| **Method** (`/method`) | The exact rules, plus what a crest proves and what it can't. |
| **No accounts** | Anonymous author token in an httpOnly cookie; only its hash is stored. |

Tiers, checked in order: **Handwritten** (≥95% of the final text typed, ≥98% witnessed, ≥30 words) →
**Human-led** (≥75% typed, ≥90% witnessed) → **Assisted** (≥40% typed) → **Assembled**. The thresholds live in
`RULES` in [`src/lib/core.ts`](src/lib/core.ts).

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind v4 · PostgreSQL 17 via `pg` · plain SQL migrations · no ORM ·
no external services.

```
src/lib/core.ts      deterministic core (replay, hashing, metrics, grading). Shared by server and browser.
src/lib/repo.ts      data access: drafts, batch append (row-locked), sealing, lookup
src/lib/seal.ts      hash → SVG wax seal
src/lib/keys.ts      Ed25519 signing key (env or auto-generated into the DB)
src/components/      Editor, CrestReader (read/replay), VerifyPanel, …
db/migrations/       SQL, applied in order by scripts/migrate.mjs
tests/               core unit tests + end-to-end smoke test
```

## Run locally

```bash
cp .env.example .env.local
npm install
npm run db:up        # Postgres 17 in Docker on :5433
npm run db:migrate
npm run dev          # http://localhost:3000
```

Tests:

```bash
npm test                         # deterministic core: replay, chain, tamper, witnessing, grading
npm run test:e2e                 # against a running server (default http://localhost:3000)
```

## Deploy

Environment variables:

| var | required | notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres 14+ (uses `gen_random_uuid()`) |
| `NEXT_PUBLIC_SITE_URL` | yes | public origin, used in badge/embed snippets and metadata |
| `CREST_SIGNING_KEY` | recommended | `npm run keygen` prints one. If unset, a key is generated on first use and stored in `server_keys`. **Don't lose it**: old signatures only verify against the key that made them. |
| `PGSSL` | optional | `require` for managed Postgres that needs TLS |
| `COOKIE_SECURE` | optional | defaults to `true` in production; set `false` only behind plain HTTP |

**Docker.** The image runs migrations on boot, then starts the standalone server:

```bash
docker build -t crest .
docker run -p 3000:3000 -e DATABASE_URL=... -e NEXT_PUBLIC_SITE_URL=https://your.domain crest
```

**Any Node host / Vercel.** `npm run build && npm start`, and run `npm run db:migrate` once per deploy.

## Honest limitations

- Crest proves **process**, not originality. Someone can retype text they read elsewhere. The rhythm chart and replay
  usually show it (flat cadence, almost no revisions), but no rule pretends to detect it.
- The client is untrusted by design. A patient attacker could script fake keystrokes in real time. Crest raises the cost
  of faking from seconds to hours of wall-clock time; it doesn't make faking impossible.
- Not yet built: rate limiting on write endpoints, and pg_trgm indexes for fuzzy lookup at scale.
