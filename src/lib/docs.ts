// Google Docs crests. Docs renders on a canvas, so the extension can't see cursor positions.
// Instead of replaying edits, we attribute the final text word by word against what the log
// can actually explain. Deterministic: same log + same final text -> same origins and metrics.
import {
  LIMITS,
  accumulate,
  round,
  sharesOf,
  verifyLinks,
  type CrestLog,
  type LinkCheck,
  type Metrics,
  type Step,
} from "./core.ts";

/**
 * One captured event: [t, kind, arg]
 *  s  snapshot of the document when recording started (first event only)
 *  k  one typed character ("\n" for Enter, "\t" for Tab)
 *  i  IME composition commit (a few characters)
 *  b  Backspace, arg = count
 *  x  forward Delete, arg = count
 *  w  word delete (Ctrl/Alt+Backspace), unknown length
 *  p  paste, arg = pasted plain text
 *  c  cut
 *  m  caret moved (arrows, click, selection)
 *  u  undo / redo
 */
export type DocsEvent =
  | [t: number, kind: "s" | "k" | "i" | "p", arg: string]
  | [t: number, kind: "b" | "x", arg: number]
  | [t: number, kind: "w" | "c" | "m" | "u", arg: null];

export const DOCS_LIMITS = { maxIme: 16, maxRepeat: 1000 } as const;

export function isDocsEvent(e: unknown): e is DocsEvent {
  if (!Array.isArray(e) || e.length !== 3 || !Number.isSafeInteger(e[0]) || e[0] <= 0) return false;
  const [, k, a] = e;
  switch (k) {
    case "s":
      return typeof a === "string" && a.length <= LIMITS.maxContentLength;
    case "k":
      return typeof a === "string" && a.length >= 1 && [...a].length === 1;
    case "i":
      return typeof a === "string" && a.length >= 1 && a.length <= DOCS_LIMITS.maxIme;
    case "p":
      return typeof a === "string" && a.length >= 1 && a.length <= LIMITS.maxInsertPerEvent;
    case "b":
    case "x":
      return Number.isSafeInteger(a) && a >= 1 && a <= DOCS_LIMITS.maxRepeat;
    case "w":
    case "c":
    case "m":
    case "u":
      return a === null;
    default:
      return false;
  }
}

export function parseDocsEvents(eventsJson: string): DocsEvent[] {
  return JSON.parse(eventsJson) as DocsEvent[];
}

/** Google Docs exports carry a BOM and CRLF line endings; normalize so hashes are stable. */
export function cleanDocText(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").replace(/ /g, " ").replace(/\s+$/, "");
}

// ---------------------------------------------------------------- words

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const normWord = (w: string) => w.normalize("NFKC").replace(/’/g, "'").toLowerCase();

type Bag = Map<string, number>;
function addWords(bag: Bag, text: string) {
  for (const m of text.matchAll(WORD)) {
    const k = normWord(m[0]);
    bag.set(k, (bag.get(k) ?? 0) + 1);
  }
}
function takeWord(bag: Bag, k: string): boolean {
  const n = bag.get(k) ?? 0;
  if (n <= 0) return false;
  bag.set(k, n - 1);
  return true;
}
function removeWords(bag: Bag, text: string) {
  for (const m of text.matchAll(WORD)) takeWord(bag, normWord(m[0]));
}

/**
 * Rebuilds what was typed as runs of contiguous typing. Backspace removes from the current run;
 * anything that may have moved the caret (click, arrows, paste, cut, undo) starts a new run.
 */
export function typedRuns(events: DocsEvent[]): string[] {
  const runs: string[] = [];
  let cur: string[] = [];
  const end = () => {
    if (cur.length) runs.push(cur.join(""));
    cur = [];
  };
  for (const [, k, a] of events) {
    if (k === "k" || k === "i") cur.push(a as string);
    else if (k === "b") {
      for (let n = a as number; n > 0 && cur.length; n--) cur.pop();
    } else if (k === "x") {
      // forward delete removes text after the caret, never the run we are building
    } else end();
  }
  end();
  return runs;
}

// ---------------------------------------------------------------- attribution

export type Attribution = { origins: string; baselineChars: number; unaccountedChars: number };

/**
 * Labels every character of the final text:
 *   p  exact pasted passage, or a word only a paste can explain
 *   t  a word that was typed in this session
 *   o  text that was already in the document when recording started
 *   u  unaccounted: nothing in the log explains it (collaborators, other devices, extension off)
 */
export function attribute(finalText: string, events: DocsEvent[]): Attribution {
  const n = finalText.length;
  const origin: (string | null)[] = new Array(n).fill(null);
  const snapshot = events[0]?.[1] === "s" ? cleanDocText(events[0][2] as string) : "";
  const pastes = events.filter((e) => e[1] === "p").map((e) => cleanDocText(e[2] as string));

  const runs = typedRuns(events);
  const typed: Bag = new Map();
  for (const run of runs) addWords(typed, run);
  const pasted: Bag = new Map();
  for (const p of pastes) addWords(pasted, p);
  const base: Bag = new Map();
  addWords(base, snapshot);

  // Docs auto-capitalizes and curls quotes, so passages are matched ignoring case and quote style.
  // Only length-preserving folds, so positions in `hay` are positions in `finalText`.
  const fold = (t: string) => t.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const folded = fold(finalText);
  const hay = folded.length === finalText.length ? folded : finalText;
  const prep = hay === folded ? fold : (t: string) => t;

  const claim = (text: string, mark: string, bag: Bag) => {
    const needle = prep(text.trim());
    if (needle.length < 12) return;
    let from = 0;
    while (true) {
      const at = hay.indexOf(needle, from);
      if (at === -1) return;
      let free = true;
      for (let i = at; i < at + needle.length; i++)
        if (origin[i] !== null) {
          free = false;
          break;
        }
      if (free) {
        for (let i = at; i < at + needle.length; i++) origin[i] = mark;
        removeWords(bag, text);
        return;
      }
      from = at + 1;
    }
  };

  // 1. exact pasted passages, 2. typed runs that survive verbatim, 3. surviving paragraphs of the snapshot
  const longestFirst = (xs: string[]) => [...xs].sort((a, b) => b.length - a.length);
  for (const p of longestFirst(pastes)) claim(p, "p", pasted);
  for (const run of longestFirst(runs)) claim(run, "t", typed);
  for (const para of longestFirst(snapshot.split("\n"))) claim(para, "o", base);

  // 4. word by word: typed, then pasted, then pre-existing, else unaccounted
  for (const m of finalText.matchAll(WORD)) {
    const at = m.index!;
    if (origin[at] !== null) continue;
    const k = normWord(m[0]);
    const mark = takeWord(typed, k) ? "t" : takeWord(pasted, k) ? "p" : takeWord(base, k) ? "o" : "u";
    for (let i = at; i < at + m[0].length; i++) origin[i] = mark;
  }

  // 5. spaces and punctuation inherit from the nearest labelled character before them (or after, at the start)
  let last: string | null = null;
  for (let i = 0; i < n; i++) {
    if (origin[i] === null) origin[i] = last;
    else last = origin[i];
  }
  let next: string | null = "t";
  for (let i = n - 1; i >= 0; i--) {
    if (origin[i] === null) origin[i] = next;
    else next = origin[i];
  }

  const origins = origin.join("");
  let baselineChars = 0;
  let unaccountedChars = 0;
  for (let i = 0; i < origins.length; i++) {
    if (origins[i] === "o") baselineChars++;
    else if (origins[i] === "u") unaccountedChars++;
  }
  return { origins, baselineChars, unaccountedChars };
}

// ---------------------------------------------------------------- metrics

const docsSteps = (eventsJson: string): Step[] =>
  parseDocsEvents(eventsJson).map(([t, k, a]): Step => {
    switch (k) {
      case "s":
        return { t, ins: 0, del: 0, kind: "o", setLen: cleanDocText(a).length };
      case "k":
      case "i":
        return { t, ins: a.length, del: 0, kind: "t" };
      case "p":
        return { t, ins: a.length, del: 0, kind: "p" };
      case "b":
      case "x":
        return { t, ins: 0, del: a, kind: "t" };
      default:
        return { t, ins: 0, del: 0, kind: "o" };
    }
  });

export function computeDocsMetrics(log: CrestLog, finalText: string): { metrics: Metrics; origins: string } {
  const events = log.batches.flatMap((b) => parseDocsEvents(b.eventsJson));
  const attr = attribute(finalText, events);
  const shares = sharesOf(finalText, attr.origins);
  const activity = accumulate(log, docsSteps);
  const denom = Math.max(1, finalText.length);
  const snap = events[0]?.[1] === "s" ? cleanDocText(events[0][2] as string).length : 0;
  return {
    origins: attr.origins,
    metrics: {
      version: 1,
      ...shares,
      ...activity,
      revisionRatio: round(activity.deleted / denom, 3),
      docs: {
        snapshotChars: snap,
        baselineShare: round(attr.baselineChars / denom),
        unaccountedShare: round(attr.unaccountedChars / denom),
      },
    },
  };
}

/** Docs logs have no replay; the chain links must hold and the first event must be the snapshot. */
export async function verifyDocsLog(log: CrestLog): Promise<LinkCheck> {
  const links = await verifyLinks(log);
  if (!links.ok) return links;
  const first = log.batches[0] ? parseDocsEvents(log.batches[0].eventsJson)[0] : null;
  if (!first || first[1] !== "s") return { ok: false, atSeq: 1, reason: "missing starting snapshot" };
  return links;
}
