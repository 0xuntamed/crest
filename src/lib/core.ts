// Crest deterministic core. Runs identically on the server and in the browser.
// Nothing in here is probabilistic: the same log always yields the same text, metrics and tier.

/** Where an inserted character came from. t = typed, p = pasted/dropped, o = other (undo/redo/autocorrect). */
export type Origin = "t" | "p" | "o";

/** One edit: at client time `t` (epoch ms), delete `del` UTF-16 units at `pos`, then insert `ins`. */
export type EditEvent = [t: number, pos: number, del: number, ins: string, kind: Origin];

export type Batch = {
  seq: number;
  receivedMs: number;
  prevHash: string;
  hash: string;
  eventsJson: string;
};

export type CrestLog = {
  version: 1;
  draftId: string;
  createdMs: number;
  genesis: string;
  batches: Batch[];
};

export const LIMITS = {
  maxEventsPerBatch: 600,
  maxInsertPerEvent: 50_000,
  maxContentLength: 120_000,
  maxTitleLength: 140,
  maxNameLength: 60,
} as const;

/** Thresholds and rules used to grade a crest. Published verbatim on /method. */
export const RULES = {
  activeGapCapMs: 120_000, // gaps longer than this are idle, not writing time
  sessionGapMs: 30 * 60_000, // gaps longer than this start a new session
  pauseMinMs: 2_000, // a "thinking pause"
  witnessToleranceMs: 10_000, // allowed drift between client-claimed and server-observed time per batch
  tiers: {
    handwritten: { typed: 0.95, witnessed: 0.98, minWords: 30 },
    humanLed: { typed: 0.75, witnessed: 0.9 },
    assisted: { typed: 0.4 },
  },
} as const;

export type Tier = "handwritten" | "human-led" | "assisted" | "assembled";

export const TIER_INFO: Record<Tier, { label: string; blurb: string }> = {
  handwritten: { label: "Handwritten", blurb: "Typed here, keystroke by keystroke, in real time." },
  "human-led": { label: "Human-led", blurb: "Mostly typed here, with some pasted or restored text." },
  assisted: { label: "Assisted", blurb: "A real mix of typed and pasted material." },
  assembled: { label: "Assembled", blurb: "Mostly pasted in. The process is on record, but it isn't handwriting." },
};

// ---------------------------------------------------------------- hashing

const enc = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", enc.encode(input));
  return toHex(new Uint8Array(buf));
}

export function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function genesisInput(draftId: string, createdMs: number): string {
  return `crest/v1/genesis\n${draftId}\n${createdMs}`;
}

export function batchInput(prevHash: string, seq: number, receivedMs: number, eventsJson: string): string {
  return `${prevHash}\n${seq}\n${receivedMs}\n${eventsJson}`;
}

export function slugFromHead(chainHead: string): string {
  return chainHead.slice(0, 12);
}

export type Source = "crest" | "gdocs";

export function signaturePayload(p: {
  source?: Source;
  slug: string;
  contentHash: string;
  chainHead: string;
  chainLength: number;
  tier: Tier;
  sealedMs: number;
}): string {
  const tag = p.source === "gdocs" ? "crest/v1/seal-gdocs" : "crest/v1/seal";
  return `${tag}\n${p.slug}\n${p.contentHash}\n${p.chainHead}\n${p.chainLength}\n${p.tier}\n${p.sealedMs}`;
}

/** Loose normalization used for "does this text have a crest?" lookups. */
export function normalizeForLookup(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ---------------------------------------------------------------- validation

/** Longest insert a single "typed" event may carry (IME composition can emit a few characters at once). */
export const MAX_TYPED_RUN = 16;

export function isEditEvent(e: unknown): e is EditEvent {
  return (
    Array.isArray(e) &&
    e.length === 5 &&
    Number.isSafeInteger(e[0]) &&
    e[0] > 0 &&
    Number.isSafeInteger(e[1]) &&
    e[1] >= 0 &&
    Number.isSafeInteger(e[2]) &&
    e[2] >= 0 &&
    typeof e[3] === "string" &&
    e[3].length <= LIMITS.maxInsertPerEvent &&
    (e[4] === "t" || e[4] === "p" || e[4] === "o") &&
    (e[4] !== "t" || e[3].length <= MAX_TYPED_RUN) &&
    (e[2] > 0 || e[3].length > 0)
  );
}

// ---------------------------------------------------------------- replay

export type DocState = { content: string; origins: string; lastT: number };

export class ReplayError extends Error {}

/** Applies events to a document, tracking the origin of every character. Throws on any inconsistency. */
export function applyEvents(state: DocState, events: EditEvent[]): DocState {
  let { content, origins, lastT } = state;
  for (const [t, pos, del, ins, kind] of events) {
    if (t < lastT) throw new ReplayError("event time went backwards");
    if (pos > content.length || pos + del > content.length) throw new ReplayError("edit out of bounds");
    content = content.slice(0, pos) + ins + content.slice(pos + del);
    origins = origins.slice(0, pos) + kind.repeat(ins.length) + origins.slice(pos + del);
    if (content.length > LIMITS.maxContentLength) throw new ReplayError("document too long");
    lastT = t;
  }
  return { content, origins, lastT };
}

export const EMPTY_DOC: DocState = { content: "", origins: "", lastT: 0 };

// ---------------------------------------------------------------- chain verification

export type ChainCheck =
  | { ok: true; head: string; length: number; doc: DocState }
  | { ok: false; atSeq: number; reason: string };

export type LinkCheck = { ok: true; head: string; length: number } | { ok: false; atSeq: number; reason: string };

/** Recomputes the genesis hash and every batch hash. Says nothing about what the events mean. */
export async function verifyLinks(log: CrestLog): Promise<LinkCheck> {
  const genesis = await sha256Hex(genesisInput(log.draftId, log.createdMs));
  if (genesis !== log.genesis) return { ok: false, atSeq: 0, reason: "genesis hash mismatch" };
  let prev = genesis;
  for (let i = 0; i < log.batches.length; i++) {
    const b = log.batches[i];
    if (b.seq !== i + 1) return { ok: false, atSeq: b.seq, reason: "sequence gap" };
    if (b.prevHash !== prev) return { ok: false, atSeq: b.seq, reason: "broken link to previous batch" };
    const h = await sha256Hex(batchInput(prev, b.seq, b.receivedMs, b.eventsJson));
    if (h !== b.hash) return { ok: false, atSeq: b.seq, reason: "batch hash mismatch" };
    prev = h;
  }
  return { ok: true, head: prev, length: log.batches.length };
}

/** Verifies every link, then replays the edits. Same function powers sealing and the in-browser verifier. */
export async function verifyChain(log: CrestLog): Promise<ChainCheck> {
  const links = await verifyLinks(log);
  if (!links.ok) return links;
  let doc = EMPTY_DOC;
  for (const b of log.batches) {
    try {
      doc = applyEvents(doc, JSON.parse(b.eventsJson) as EditEvent[]);
    } catch (err) {
      return { ok: false, atSeq: b.seq, reason: err instanceof Error ? err.message : "replay failed" };
    }
  }
  return { ok: true, head: links.head, length: links.length, doc };
}

// ---------------------------------------------------------------- metrics

export type Metrics = {
  version: 1;
  chars: number;
  words: number;
  typedShare: number;
  pastedShare: number;
  otherShare: number;
  inserted: { t: number; p: number; o: number };
  deleted: number;
  pasteEvents: number;
  largestPaste: number;
  events: number;
  batches: number;
  activeMs: number;
  spanMs: number;
  sessions: number;
  pauses: number;
  wpm: number;
  witnessedShare: number;
  revisionRatio: number;
  /** Inter-keystroke intervals for typed inserts: <100, <200, <400, <800, <1600, <3200, >=3200 ms */
  rhythm: number[];
  /** Document length sampled at 64 evenly spaced points of writing activity. */
  growth: number[];
  /** Present on crests written in Google Docs. */
  docs?: { snapshotChars: number; baselineShare: number; unaccountedShare: number };
};

export const RHYTHM_BUCKETS = [100, 200, 400, 800, 1600, 3200];

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

export const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

/** One unit of writing activity, independent of where it was captured. */
export type Step = { t: number; ins: number; del: number; kind: Origin; setLen?: number };

type Activity = Pick<
  Metrics,
  | "inserted"
  | "deleted"
  | "pasteEvents"
  | "largestPaste"
  | "events"
  | "batches"
  | "activeMs"
  | "spanMs"
  | "sessions"
  | "pauses"
  | "wpm"
  | "witnessedShare"
  | "rhythm"
  | "growth"
>;

/** Timing, witnessing, rhythm and growth: the same rules for every source. */
export function accumulate(log: CrestLog, stepsOf: (eventsJson: string) => Step[]): Activity {
  const inserted = { t: 0, p: 0, o: 0 };
  let deleted = 0;
  let pasteEvents = 0;
  let largestPaste = 0;
  let events = 0;
  let activeMs = 0;
  let sessions = 0;
  let pauses = 0;
  let firstT = 0;
  let prevT = 0;
  let prevTypedT = 0;
  let witnessedChars = 0;
  let totalChars = 0;
  const rhythm = new Array(RHYTHM_BUCKETS.length + 1).fill(0);
  const lengthsByActive: Array<[number, number]> = [];
  let len = 0;

  let prevReceived = log.createdMs;
  let prevBatchLastT = 0;

  for (const b of log.batches) {
    const steps = stepsOf(b.eventsJson);
    if (steps.length === 0) continue;
    const batchFirstT = steps[0].t;
    const batchLastT = steps[steps.length - 1].t;
    const clientElapsed = batchLastT - (prevBatchLastT || batchFirstT);
    const serverElapsed = b.receivedMs - prevReceived;
    const witnessed = clientElapsed <= serverElapsed + RULES.witnessToleranceMs;
    prevReceived = b.receivedMs;
    prevBatchLastT = batchLastT;

    for (const { t, ins, del, kind, setLen } of steps) {
      events++;
      if (!firstT) {
        firstT = t;
        sessions = 1;
      } else {
        const gap = t - prevT;
        if (gap <= RULES.activeGapCapMs) activeMs += gap;
        if (gap >= RULES.sessionGapMs) sessions++;
        if (gap >= RULES.pauseMinMs && gap < RULES.activeGapCapMs) pauses++;
      }
      prevT = t;

      deleted += del;
      if (ins) {
        inserted[kind] += ins;
        totalChars += ins;
        if (witnessed) witnessedChars += ins;
        if (kind === "p") {
          pasteEvents++;
          largestPaste = Math.max(largestPaste, ins);
        }
        if (kind === "t") {
          if (prevTypedT) {
            const iki = t - prevTypedT;
            let i = RHYTHM_BUCKETS.findIndex((edge) => iki < edge);
            if (i === -1) i = RHYTHM_BUCKETS.length;
            rhythm[i]++;
          }
          prevTypedT = t;
        }
      }
      len = setLen ?? Math.max(0, len + ins - del);
      lengthsByActive.push([activeMs, len]);
    }
  }

  const growth: number[] = [];
  const samples = 64;
  if (lengthsByActive.length) {
    let j = 0;
    for (let s = 0; s < samples; s++) {
      const target = (activeMs * s) / (samples - 1);
      while (j < lengthsByActive.length - 1 && lengthsByActive[j + 1][0] <= target) j++;
      growth.push(lengthsByActive[j][1]);
    }
    growth[samples - 1] = len;
  }

  return {
    inserted,
    deleted,
    pasteEvents,
    largestPaste,
    events,
    batches: log.batches.length,
    activeMs,
    spanMs: prevT && firstT ? prevT - firstT : 0,
    sessions,
    pauses,
    wpm: activeMs > 0 ? round(inserted.t / 5 / (activeMs / 60_000), 1) : 0,
    witnessedShare: totalChars ? round(witnessedChars / totalChars) : 1,
    rhythm,
    growth,
  };
}

/** Share of the final text by origin. Anything that isn't t or p counts as other. */
export function sharesOf(content: string, origins: string) {
  let ct = 0,
    cp = 0,
    co = 0;
  for (let i = 0; i < origins.length; i++) {
    const c = origins.charCodeAt(i);
    if (c === 116) ct++;
    else if (c === 112) cp++;
    else co++;
  }
  const denom = Math.max(1, content.length);
  return {
    chars: content.length,
    words: countWords(content),
    typedShare: round(ct / denom),
    pastedShare: round(cp / denom),
    otherShare: round(co / denom),
  };
}

const editSteps = (eventsJson: string): Step[] =>
  (JSON.parse(eventsJson) as EditEvent[]).map(([t, , del, ins, kind]) => ({ t, ins: ins.length, del, kind }));

export function computeMetrics(log: CrestLog, doc: DocState): Metrics {
  const shares = sharesOf(doc.content, doc.origins);
  const activity = accumulate(log, editSteps);
  return {
    version: 1,
    ...shares,
    ...activity,
    revisionRatio: round(activity.deleted / Math.max(1, shares.chars), 3),
  };
}

export function gradeTier(m: Metrics): Tier {
  const r = RULES.tiers;
  if (m.typedShare >= r.handwritten.typed && m.witnessedShare >= r.handwritten.witnessed && m.words >= r.handwritten.minWords)
    return "handwritten";
  if (m.typedShare >= r.humanLed.typed && m.witnessedShare >= r.humanLed.witnessed) return "human-led";
  if (m.typedShare >= r.assisted.typed) return "assisted";
  return "assembled";
}

// ---------------------------------------------------------------- formatting

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

export function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits).replace(/\.0+$/, "")}%`;
}
