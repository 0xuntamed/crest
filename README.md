<p align="center">
  <img src="docs/screenshots/banner.png" alt="Crest: prove a human wrote it" width="880">
</p>

<p align="center">
  <b>Signed, replayable proof that a human wrote something.</b><br>
  Every keystroke is hash-chained and witnessed by the server. No AI detectors. No guesswork. Just the record.
</p>

<p align="center">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-000?logo=nextdotjs">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white">
  <img alt="PostgreSQL 17" src="https://img.shields.io/badge/PostgreSQL-17-336791?logo=postgresql&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white">
  <img alt="Chrome MV3" src="https://img.shields.io/badge/Chrome%20extension-MV3-4285f4?logo=googlechrome&logoColor=white">
  <img alt="Ed25519" src="https://img.shields.io/badge/signatures-Ed25519-00b1fa">
</p>

---

## Contents

- [Why Crest exists](#why-crest-exists)
- [A tour in screenshots](#a-tour-in-screenshots)
- [How it works](#how-it-works)
- [The Google Docs extension](#the-google-docs-extension)
- [What a crest proves (and what it doesn't)](#what-a-crest-proves-and-what-it-doesnt)
- [Architecture](#architecture)
- [Run it locally](#run-it-locally)
- [Testing](#testing)
- [Deploying](#deploying)
- [API reference](#api-reference)
- [Security model](#security-model)
- [Limitations and roadmap](#limitations-and-roadmap)

---

## Why Crest exists

AI detectors are coin flips with consequences. Students get failed and freelancers lose clients because a classifier
didn't like their sentence rhythm. People who are wrongly accused have no evidence to offer except a messy version
history.

Crest takes the opposite approach. It doesn't ask a model whether text *looks* human. It records how the text was
*made*:

1. **Write.** Write in Crest's editor, or in Google Docs with the extension. Every insert, delete, paste and undo
   becomes an event.
2. **Witness.** About once a second the events go to the server. The server replays them, stamps them with its own
   clock, and hashes each batch onto the previous one.
3. **Seal.** The server replays the whole chain, grades it with **fixed, published rules**, and signs the result with
   **Ed25519**.
4. **Share.** You get a public page with a keystroke replay, every pasted character highlighted, and a button that lets
   anyone re-check everything in their own browser.

Nothing is probabilistic: the same log always produces the same text, metrics, tier, URL and seal artwork.

<p align="center">
  <img src="docs/screenshots/home.png" alt="Crest home page" width="880">
</p>

---

## A tour in screenshots

> Every screenshot below was produced by actually using the product. `npm run screenshots` types the demo pieces into
> the real editor and the real extension in real time, seals them, and captures each screen.
> See [Regenerating screenshots](#regenerating-screenshots).

### 1. Write

A calm, distraction-free editor. The sidebar is a live record: how much of the text was typed versus pasted, the
current head of the hash chain, how many batches the server has witnessed, and the tier you're on track for.

<img src="docs/screenshots/editor.png" alt="The Crest editor with the live record sidebar" width="880">

### 2. Seal

Sealing freezes the text. The server replays every event from the raw log, grades the result, and signs it.

<img src="docs/screenshots/seal-dialog.png" alt="The seal dialog" width="880">

### 3. The crest

Each crest gets a permanent page. Its wax seal artwork is generated from the chain's hash, so no two look alike. The
facts come straight from the log: words, writing time and sessions, typed vs pasted share, revisions, pace, and how much
of it the server witnessed.

<img src="docs/screenshots/crest.png" alt="A sealed crest page" width="880">

Below the facts are three charts: where the text came from, the rhythm of keystroke gaps (people are lumpy, scripts
are flat), and how the document grew over writing time (a paste shows up as a cliff).

<img src="docs/screenshots/crest-charts.png" alt="Origin bar, keystroke rhythm and growth charts" width="880">

### 4. Highlights and replay

Every pasted character is highlighted in the sealed text. Crests written in the editor can be replayed keystroke by
keystroke, with a scrubber and 1×–64× speed.

| Pasted text, highlighted | Keystroke replay |
|---|---|
| <img src="docs/screenshots/highlights.png" alt="Pasted quote highlighted in a crest" width="430"> | <img src="docs/screenshots/replay.png" alt="Keystroke replay paused mid-way" width="430"> |

### 5. Don't trust, verify

The **Verify** button downloads the raw log and redoes every check in the reader's own browser. It re-hashes each
batch, replays the edits, re-grades with the same rules, and checks the server's Ed25519 signature with WebCrypto.
The embeddable badge sits next to it.

<img src="docs/screenshots/verify.png" alt="In-browser verification, all checks passing, next to the embed badge" width="880">

### 6. Look up any text

Teachers, editors and hiring managers can paste a passage into `/verify` to find the crest it came from. Matching
ignores case, quote style and whitespace, and a paragraph can match inside a longer piece.

<img src="docs/screenshots/lookup.png" alt="Looking up an excerpt finds its crest" width="880">

### 7. Share it

Links unfurl into a share card on X, Slack, iMessage and Discord, and every crest has an embeddable SVG badge.

| Share card | Badge |
|---|---|
| <img src="docs/screenshots/share-card.png" alt="Open Graph share card for a crest" width="560"> | <img src="docs/screenshots/badge.svg" alt="Crest badge" width="268"> |

Public crests appear on the home page's wall, each with its own seal. You can also seal a piece as unlisted, so only
people with the link can see it.

<img src="docs/screenshots/wall.png" alt="The public wall of freshly sealed crests" width="880">

### 8. Google Docs

The extension records writing inside Google Docs and seals it the same way. See
[The Google Docs extension](#the-google-docs-extension) for how it works.

| Recording in a doc | Sealing from the doc | Sealed |
|---|---|---|
| <img src="docs/screenshots/extension-recording.png" alt="The Crest recorder inside a document" width="290"> | <img src="docs/screenshots/extension-seal.png" alt="The in-document seal dialog" width="290"> | <img src="docs/screenshots/extension-sealed.png" alt="The crest link, ready to share" width="290"> |

A Docs crest is labelled as such, and its facts show how much text the log can't explain:

<img src="docs/screenshots/docs-crest.png" alt="A crest written in Google Docs" width="880">

Every word is attributed: typed, pasted, already in the doc when recording started, or unaccounted.

<img src="docs/screenshots/docs-highlights.png" alt="Word-level attribution on a Google Docs crest" width="880">

### Dark mode and mobile

| Dark | Mobile |
|---|---|
| <img src="docs/screenshots/crest-dark.png" alt="A crest in dark mode" width="560"> | <img src="docs/screenshots/mobile.png" alt="A crest on a phone" width="240"> |

---

## How it works

```mermaid
sequenceDiagram
    autonumber
    participant W as Writer's browser
    participant S as Crest server
    participant DB as Postgres
    participant R as Reader's browser

    W->>S: create draft
    S->>DB: genesis = sha256("crest/v1/genesis" ∥ draft id ∥ created_ms)
    loop about every 1.2 s while writing
        W->>S: batch { seq, events[] }
        S->>S: replay events against the server's copy (rejects anything invalid)
        S->>DB: hash = sha256(prev ∥ seq ∥ server_ms ∥ events_json)
    end
    W->>S: seal
    S->>S: replay the whole chain from genesis, compute metrics, grade the tier
    S->>DB: crest + Ed25519 signature
    R->>S: GET /c/:slug and /api/crests/:slug/log
    R->>R: re-hash, replay, re-grade, verify the signature (WebCrypto)
```

### The event log

The editor turns every change into one splice, anchored to the caret so repeated letters are never ambiguous:

```text
[ t,              pos, del, ins,  kind ]
[ 1759561200412,  214, 0,   "r",  "t"  ]   typed
[ 1759561203004,  216, 0,   "…",  "p"  ]   pasted or dropped
[ 1759561209551,  40,  12,  "",   "o"  ]   undo / redo / autocorrect / predictive
```

A real keystroke inserts exactly one character, so a multi-character "typed" insert is never counted as typed. That
covers execCommand, extensions, automation, and predictive keyboards. IME composition is the only exception. The
server enforces this too.

### The hash chain

```text
genesis   = sha256("crest/v1/genesis\n" + draftId + "\n" + createdMs)
batch[n]  = sha256(batch[n-1] + "\n" + n + "\n" + serverReceivedMs + "\n" + eventsJson)
slug      = first 12 hex digits of the final chain head
```

`events_json` is stored verbatim, so anyone can re-hash it. Changing a single keystroke breaks every hash after it.

### Witnessing

Client clocks can't be trusted, but elapsed time can be checked. A batch counts as **witnessed** only if the writing
time the client claims fits inside the time the server actually saw pass between batches, within 10 seconds. A log
fabricated offline and uploaded at once claims hours that the server never saw.

### Grading

Grading looks at the **final** text: every surviving character carries the origin of the event that inserted it. The
tiers are checked in order:

| Tier | Rule |
|---|---|
| **Handwritten** | ≥ 95% of the final text typed · ≥ 98% witnessed · ≥ 30 words |
| **Human-led** | ≥ 75% typed · ≥ 90% witnessed |
| **Assisted** | ≥ 40% typed |
| **Assembled** | everything else |

Writing time sums gaps shorter than 2 minutes; a gap of 30+ minutes starts a new session; a pause of 2+ seconds counts
as a thinking pause. All thresholds live in one object, `RULES` in [`src/lib/core.ts`](src/lib/core.ts), and are
published on `/method`.

### Signing

```text
crest/v1/seal            (or crest/v1/seal-gdocs for Docs crests)
<slug>
<sha256 of the final text>
<chain head>
<chain length>
<tier>
<sealed-at ms>
```

The payload is signed with Ed25519. The public key is served at `/api/pubkey`.

### One core, two places

[`src/lib/core.ts`](src/lib/core.ts) (replay, hashing, metrics, grading) and [`src/lib/docs.ts`](src/lib/docs.ts) (Docs
attribution) are dependency-free and run unchanged on the server during sealing and in the reader's browser during
verification. If the two ever disagreed, verification would fail.

<img src="docs/screenshots/method.png" alt="The /method page" width="880">

---

## The Google Docs extension

Google Docs draws text on a canvas, so an extension can't see cursor positions, and exact replay is impossible. Docs
crests keep the same witnessed hash chain and signature, with a different, still deterministic way of crediting text.

**What it records** (only after you press **Record with Crest**): every keystroke, Backspace/Delete, paste (with its
plain text), cut, undo and caret move, from Docs' hidden input iframe, plus a snapshot of the document when recording
starts. Script-dispatched (untrusted) events are ignored.

**When you seal,** the extension reads the document's text through your own Docs session and the server attributes
every word:

```mermaid
flowchart LR
    A[Final document text] --> B{Exact pasted passage?}
    B -- yes --> P[pasted]
    B -- no --> C{Typed run that survives verbatim?}
    C -- yes --> T[typed]
    C -- no --> D{Paragraph from the starting snapshot?}
    D -- yes --> O[already in the doc]
    D -- no --> E{Word by word: in the typed stream? in a paste? in the snapshot?}
    E -- typed --> T
    E -- pasted --> P
    E -- snapshot --> O
    E -- none --> U[unaccounted]
```

Unaccounted text counts against the typed share. That closes the obvious cheat: type junk to inflate the keystroke
count, then paste AI text with the extension switched off. The junk's words aren't the essay's words, so the essay is
unaccounted and the crest grades **Assembled**. There is a unit test for exactly this.

Docs crests are labelled "Written in Google Docs", have no replay, and highlight per word.

**Install (unpacked):**

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the `extension/` folder.
2. Click the Crest toolbar icon and set the **Crest server** URL (default `http://localhost:3000`).
3. Open a Google Doc and press **Record with Crest** (bottom-right).

**Develop without a Google account:** `npm run ext:harness` serves a Docs look-alike on port 4100 that loads the
unmodified `content.js` with a small `chrome.*` shim.

---

## What a crest proves (and what it doesn't)

| ✓ A crest proves | ✕ A crest can't prove |
|---|---|
| The text was produced by the edits on record, in that order (editor crests replay exactly) | That the ideas are original. Someone can retype text they read elsewhere, though the rhythm chart and replay usually give it away |
| The edits happened over real time the server observed | Who sat at the keyboard. Crest proves the process, not the person |
| How much was pasted, and exactly which characters (or, for Docs, which words) | Resistance to a patient attacker scripting fake keystrokes in real time. Crest raises the cost of faking from seconds to hours |
| Nobody has changed the log or the text since sealing | |

---

## Architecture

```mermaid
flowchart TB
    subgraph Browser
        E["Editor<br/>src/components/Editor.tsx"]
        V["Verify panel<br/>WebCrypto + core.ts"]
    end
    subgraph Extension["Chrome extension (MV3)"]
        CS["content.js<br/>captures events in Docs"]
        BG["background.js<br/>bearer token, API relay, doc text"]
    end
    subgraph Next["Next.js 16 app"]
        API["Route handlers<br/>/api/drafts · /api/ext · /api/crests"]
        CORE["core.ts · docs.ts<br/>deterministic core"]
        KEYS["keys.ts<br/>Ed25519"]
        PAGES["Pages · OG images · badges"]
    end
    DB[("PostgreSQL")]

    E -- batches --> API
    CS --> BG -- batches --> API
    API --> CORE
    API --> KEYS
    API --> DB
    PAGES --> DB
    V -- raw log --> API
```

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS v4 · PostgreSQL 17 via `pg` · plain SQL
migrations (no ORM) · `next/og` share images · Chrome Manifest V3 · no third-party services.

### Project layout

```text
src/
  app/                      pages, route handlers, OG images
    api/drafts/…            editor API (cookie auth)
    api/ext/…               extension API (bearer auth, CORS)
    api/crests/[slug]/log   the raw, public, append-only log
    c/[slug]/               crest page + share image
  components/               Editor, CrestReader (read/replay), VerifyPanel, charts, seal
  lib/
    core.ts                 deterministic core: replay, hashing, metrics, grading
    docs.ts                 Google Docs attribution
    repo.ts                 data access: drafts, row-locked batch append, sealing, lookup
    seal.ts                 hash → SVG wax seal
    keys.ts                 Ed25519 signing key
extension/                  the Chrome extension (plain JS, no build step)
db/migrations/              SQL, applied in order by scripts/migrate.mjs
tests/                      unit tests, end-to-end tests, Docs harness
scripts/                    migrate, keygen, screenshots
```

### Data model

| Table | Holds |
|---|---|
| `authors` | Anonymous identities. Only a sha256 of each secret token is stored. |
| `drafts` | An open writing session: source (`crest` or `gdocs`), the server's replayed content and per-character origins, chain head, sequence number. |
| `batches` | One row per chain link: verbatim `events_json`, server receive time, previous hash, hash. |
| `crests` | The sealed result: text, origins, metrics (JSON), tier, chain head and length, signature, public/unlisted. |
| `server_keys` | The auto-generated signing key, used only when `CREST_SIGNING_KEY` isn't set. |

---

## Run it locally

**Prerequisites:** Node 20.9+, Docker (for Postgres), npm.

```bash
cp .env.example .env.local
npm install
npm run db:up        # Postgres 17 in Docker on port 5433
npm run db:migrate
npm run dev          # http://localhost:3000
```

No accounts, no email: the first time you press **Start writing**, an anonymous author cookie is created.

---

## Testing

```bash
npm test             # unit tests: replay, chain, tampering, witnessing, grading, Docs attribution and the junk-typing attack
npm run test:e2e     # editor end to end against a running server: types in real time, seals, verifies independently
npm run test:e2e:ext # extension API end to end: Docs recording, attribution, gdocs signature, CORS
npm run lint
npm run typecheck
```

The end-to-end suites re-verify every crest they create without trusting the server: they recompute the hash chain,
replay or re-attribute, re-grade, and check the Ed25519 signature with Node's crypto.

### Regenerating screenshots

```bash
npm run dev            # terminal 1
npm run ext:harness    # terminal 2
npm run screenshots    # terminal 3: drives your installed Edge (CREST_BROWSER=chrome for Chrome)
```

It takes a few minutes because the typing happens in real time. Run one step with
`ONLY=essay|paste|docs|pages npm run screenshots`.

---

## Deploying

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres 14+ (uses `gen_random_uuid()`) |
| `NEXT_PUBLIC_SITE_URL` | yes | Public origin, used in share links, badges and metadata |
| `CREST_SIGNING_KEY` | recommended | Run `npm run keygen` to print one. If unset, a key is generated on first use and stored in `server_keys`. **Don't lose it**: old signatures only verify against the key that made them. |
| `PGSSL` | optional | `require` for managed Postgres that needs TLS |
| `COOKIE_SECURE` | optional | Defaults to `true` in production. Set `false` only behind plain HTTP |

**Docker.** The image runs migrations on boot, then starts Next's standalone server:

```bash
docker build -t crest .
docker run -p 3000:3000 -e DATABASE_URL=… -e NEXT_PUBLIC_SITE_URL=https://your.domain crest
```

**Any Node host or Vercel:** `npm run build && npm start`, and run `npm run db:migrate` once per deploy.

After deploying, point the extension at your domain from its popup.

---

## API reference

**Editor API** (anonymous author cookie, same-origin)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/write/new` | Create a draft and redirect to the editor |
| `POST` | `/api/drafts/:id/events` | Append a batch `{ seq, events }` |
| `PATCH` | `/api/drafts/:id` | Set the title |
| `DELETE` | `/api/drafts/:id` | Delete an open draft |
| `POST` | `/api/drafts/:id/seal` | Seal `{ title, authorName, isPublic }` → `{ slug }` |

**Extension API** (`Authorization: Bearer <token>`, any origin)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/ext/session` | Issue an anonymous token |
| `POST` / `GET` | `/api/ext/drafts` | Start or resume recording a doc `{ docId, title }` / list recordings |
| `GET` / `DELETE` | `/api/ext/drafts/:id` | Status / discard |
| `POST` | `/api/ext/drafts/:id/events` | Append a batch of Docs events |
| `POST` | `/api/ext/drafts/:id/seal` | Seal `{ finalText, title, authorName, isPublic }` → `{ slug, url, tier }` |

**Public**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/c/:slug` | Crest page |
| `GET` | `/api/crests/:slug/log` | Raw log + seal (everything needed to verify) |
| `GET` | `/api/badge/:slug` | Embeddable SVG badge |
| `GET` | `/api/pubkey` | Ed25519 public key (SPKI, base64 and PEM) |
| `POST` | `/api/verify` | Find crests containing `{ text }` |

---

## Security model

- **No passwords, no emails.** Identities are random 256-bit tokens. The server stores only their sha256.
- **Two auth channels, never mixed.** The website uses an httpOnly, SameSite=Lax cookie. The extension uses a bearer
  token and its routes never read cookies. That's why the extension routes can safely allow any origin.
- **The client is untrusted.** The server re-validates and replays every batch, row-locks drafts while appending, and
  rejects malformed, out-of-order or out-of-bounds events.
- **Tamper evidence.** Logs are append-only and hash-chained. Crests are signed, and the payload binds the slug, text
  hash, chain head, length, tier and time.
- **Privacy.** The extension records nothing until you press Record, and only in that document. Sealed logs are public
  by design (that's what makes them verifiable). Unlisted crests stay off the public wall but are readable by anyone
  with the link.

---

## Limitations and roadmap

- **Proof of process, not originality.** See the table above.
- **Docs attribution is per word**, has no replay, and depends on Docs' current structure (the hidden
  `docs-texteventtarget-iframe`). The extension has been exercised against a faithful harness and through its API
  end to end. Run it against your own Google Docs before relying on it.
- **Not built yet:** rate limiting on write endpoints, versioning for attribution rules (so future changes can't break
  verification of older Docs crests), Chrome Web Store packaging, and trigram indexes for fuzzy lookup at scale.

---

<p align="center"><sub>Crest records how words were made so nobody has to guess.</sub></p>
