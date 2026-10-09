"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { applyEvents, EMPTY_DOC, type CrestLog, type DocState, type EditEvent, type Source } from "@/lib/core";
import { OriginText } from "./OriginText";

type Tab = "read" | "replay";

const DOCS_TITLES = { p: "pasted", o: "already in the doc", u: "unaccounted" };

export function CrestReader({
  slug,
  content,
  origins,
  source = "crest",
}: {
  slug: string;
  content: string;
  origins: string;
  source?: Source;
}) {
  const [tab, setTab] = useState<Tab>("read");
  const [highlight, setHighlight] = useState(true);
  const hasNonTyped = useMemo(() => /[pou]/.test(origins), [origins]);
  const docs = source === "gdocs";
  const tabs: Tab[] = docs ? ["read"] : ["read", "replay"];

  return (
    <section className="card overflow-clip">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline px-4 py-3 sm:px-6">
        <div className="flex rounded-full bg-paper-2 p-1 text-[13px]">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 capitalize transition ${tab === t ? "bg-card text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}
            >
              {t === "replay" ? "▶ Replay" : "Read"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-[12px] text-ink-3">
          <span className="flex items-center gap-1.5"><i className="o-p inline-block h-3 w-4" /> pasted</span>
          <span className="flex items-center gap-1.5">
            <i className="o-o inline-block h-3 w-4" /> {docs ? "already in the doc" : "undo/autocorrect"}
          </span>
          {docs && (
            <span className="flex items-center gap-1.5"><i className="o-u inline-block h-3 w-4" /> unaccounted</span>
          )}
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} className="accent-[var(--wax)]" />
            highlight
          </label>
        </div>
      </div>
      <div className="px-5 py-8 sm:px-10 sm:py-12">
        {tab === "read" ? (
          <>
            {!hasNonTyped && highlight && (
              <p className="label mb-6 !text-typed">
                {docs ? "Every word below was typed during the recording." : "Every character below was typed here."}
              </p>
            )}
            {docs && (
              <p className="mx-auto mb-6 max-w-[68ch] text-[13px] leading-relaxed text-ink-3">
                Written in Google Docs, which doesn&apos;t expose cursor positions, so there&apos;s no keystroke replay. Each word
                is credited only if it appeared in the recorded typing.
              </p>
            )}
            <div className="prose-read mx-auto max-w-[68ch]">
              <OriginText content={content} origins={origins} highlight={highlight} titles={docs ? DOCS_TITLES : undefined} />
            </div>
          </>
        ) : (
          <Replay slug={slug} highlight={highlight} />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- replay

type Prepared = {
  events: EditEvent[];
  clock: number[]; // compressed playback time per event (ms)
  snapshots: DocState[]; // state before event k*SNAP
};

const SNAP = 200;
const MAX_GAP = 1200;
const SPEEDS = [1, 4, 16, 64];

let logCache: Record<string, Promise<CrestLog>> = {};
export function fetchLog(slug: string) {
  logCache[slug] ??= fetch(`/api/crests/${slug}/log`).then((r) => {
    if (!r.ok) {
      logCache = {};
      throw new Error("Couldn't load the log");
    }
    return r.json();
  });
  return logCache[slug];
}

function prepare(log: CrestLog): Prepared {
  const events: EditEvent[] = [];
  for (const b of log.batches) events.push(...(JSON.parse(b.eventsJson) as EditEvent[]));
  const clock: number[] = [];
  let c = 0;
  for (let i = 0; i < events.length; i++) {
    if (i > 0) c += Math.min(MAX_GAP, Math.max(0, events[i][0] - events[i - 1][0]));
    clock.push(c);
  }
  const snapshots: DocState[] = [];
  let doc = EMPTY_DOC;
  for (let i = 0; i < events.length; i++) {
    if (i % SNAP === 0) snapshots.push(doc);
    doc = applyEvents(doc, [events[i]]);
  }
  snapshots.push(doc);
  return { events, clock, snapshots };
}

function stateAt(p: Prepared, n: number): { doc: DocState; caret: number } {
  const k = Math.floor(n / SNAP);
  let doc = p.snapshots[Math.min(k, p.snapshots.length - 1)];
  const from = Math.min(k, p.snapshots.length - 1) * SNAP;
  if (n > from) doc = applyEvents(doc, p.events.slice(from, n));
  const last = p.events[n - 1];
  return { doc, caret: last ? last[1] + last[3].length : 0 };
}

function Replay({ slug, highlight }: { slug: string; highlight: boolean }) {
  const [prep, setPrep] = useState<Prepared | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const nRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);

  useEffect(() => {
    fetchLog(slug)
      .then((log) => {
        setPrep(prepare(log));
        setPlaying(true);
      })
      .catch((e) => setErr(e.message));
  }, [slug]);

  const total = prep?.events.length ?? 0;
  const duration = prep ? (prep.clock[prep.clock.length - 1] ?? 0) : 0;

  useEffect(() => {
    if (!playing || !prep) return;
    const startN = nRef.current >= total ? 0 : nRef.current;
    const startClock = startN > 0 ? prep.clock[startN - 1] : 0;
    const wall = performance.now();
    let id = 0;
    const tick = () => {
      const target = startClock + (performance.now() - wall) * speed;
      let lo = startN;
      let hi = prep.clock.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (prep.clock[mid] <= target) lo = mid + 1;
        else hi = mid;
      }
      nRef.current = lo;
      setN(lo);
      if (lo >= total) {
        setPlaying(false);
        return;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, speed, prep, total]);

  const view = useMemo(() => (prep ? stateAt(prep, n) : null), [prep, n]);

  if (err) return <p className="text-center text-wax-text">{err}</p>;
  if (!prep || !view) return <p className="label text-center">Loading the raw log…</p>;

  const elapsed = n > 0 ? prep.clock[n - 1] : 0;
  const realT = n > 0 ? prep.events[n - 1][0] : prep.events[0]?.[0];

  return (
    <div>
      <div className="sticky top-14 z-10 -mx-5 mb-8 flex flex-wrap items-center gap-3 border-b hairline bg-card/90 px-5 py-3 backdrop-blur sm:-mx-10 sm:px-10">
        <button
          onClick={() => setPlaying((p) => !p)}
          className="grid size-10 place-items-center rounded-full bg-wax text-wax-ink"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor" /></svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={total}
          value={n}
          onChange={(e) => {
            setPlaying(false);
            nRef.current = Number(e.target.value);
            setN(nRef.current);
          }}
          className="h-1 min-w-[140px] flex-1 accent-[var(--wax)]"
          aria-label="Scrub through the writing"
        />
        <div className="flex rounded-full bg-paper-2 p-0.5 font-mono text-[11px]">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`rounded-full px-2.5 py-1 ${speed === s ? "bg-card text-ink shadow-sm" : "text-ink-3"}`}
            >
              {s}×
            </button>
          ))}
        </div>
        <div className="w-full font-mono text-[11px] text-ink-3 sm:w-auto">
          event {n.toLocaleString()} / {total.toLocaleString()} · {fmtClock(elapsed)} / {fmtClock(duration)}
          {realT ? ` · ${new Date(realT).toLocaleString()}` : ""}
        </div>
      </div>
      <div className="prose-read mx-auto min-h-[40vh] max-w-[68ch]">
        <OriginText content={view.doc.content} origins={view.doc.origins} highlight={highlight} caretAt={view.caret} />
      </div>
      <p className="label mt-8 text-center !normal-case !tracking-normal">
        Pauses longer than {MAX_GAP / 1000}s are shortened during playback. Real timestamps are shown above.
      </p>
    </div>
  );
}

function fmtClock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
