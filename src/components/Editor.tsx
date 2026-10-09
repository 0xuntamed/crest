"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LIMITS,
  MAX_TYPED_RUN,
  RULES,
  TIER_INFO,
  countWords,
  pct,
  type EditEvent,
  type Origin,
  type Tier,
} from "@/lib/core";
import { Seal } from "./Seal";
import { OriginBar } from "./OriginBar";

type Props = {
  draftId: string;
  initial: { title: string; content: string; origins: string; seq: number; headHash: string; lastT: number };
};

type SyncState = "idle" | "syncing" | "offline" | "conflict";

const FLUSH_MS = 1200;

function kindFor(inputType: string): Origin {
  if (/^insertFrom(Paste|Drop|Yank)/.test(inputType)) return "p";
  if (inputType === "historyUndo" || inputType === "historyRedo" || inputType === "insertReplacementText") return "o";
  if (inputType === "deleteByCut" || inputType === "deleteByDrag") return "o";
  return "t";
}

/** Turns old -> new textarea value into a single splice, using the caret to disambiguate repeated characters. */
function diff(prev: string, next: string, caretAfter: number) {
  const maxSuffix = Math.min(prev.length, next.length - caretAfter);
  let suffix = 0;
  while (suffix < maxSuffix && prev.charCodeAt(prev.length - 1 - suffix) === next.charCodeAt(next.length - 1 - suffix)) suffix++;
  const maxPrefix = Math.min(prev.length, next.length) - suffix;
  let prefix = 0;
  while (prefix < maxPrefix && prev.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix++;
  return { pos: prefix, del: prev.length - prefix - suffix, ins: next.slice(prefix, next.length - suffix) };
}

function predictTier(typedShare: number, words: number): Tier {
  const r = RULES.tiers;
  if (typedShare >= r.handwritten.typed && words >= r.handwritten.minWords) return "handwritten";
  if (typedShare >= r.humanLed.typed) return "human-led";
  if (typedShare >= r.assisted.typed) return "assisted";
  return "assembled";
}

export function Editor({ draftId, initial }: Props) {
  const router = useRouter();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initial.content);
  const [origins, setOrigins] = useState(initial.origins);
  const [title, setTitle] = useState(initial.title);
  const [seq, setSeq] = useState(initial.seq);
  const [head, setHead] = useState(initial.headHash);
  const [sync, setSync] = useState<SyncState>("idle");
  const [queued, setQueued] = useState(0);
  const [pastes, setPastes] = useState(0);
  const [sealOpen, setSealOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prevValue = useRef(initial.content);
  const lastT = useRef(initial.lastT);
  const pending = useRef<EditEvent[]>([]);
  const inflight = useRef(false);
  const seqRef = useRef(initial.seq);
  const inputType = useRef("insertText");
  const inputData = useRef<string | null>(null);
  const backoff = useRef(0);

  // ---------------------------------------------------------------- sync
  const flush = useCallback(async (keepalive = false) => {
    if (inflight.current || pending.current.length === 0 || seqRef.current < 0) return;
    inflight.current = true;
    const events = pending.current.slice(0, LIMITS.maxEventsPerBatch);
    const nextSeq = seqRef.current + 1;
    setSync("syncing");
    try {
      const res = await fetch(`/api/drafts/${draftId}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seq: nextSeq, events }),
        keepalive: keepalive && JSON.stringify(events).length < 60_000,
      });
      if (res.status === 409 || res.status === 422) {
        seqRef.current = -1;
        setSync("conflict");
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "This draft changed somewhere else.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const out = (await res.json()) as { seq: number; headHash: string };
      pending.current = pending.current.slice(events.length);
      seqRef.current = out.seq;
      backoff.current = 0;
      setSeq(out.seq);
      setHead(out.headHash);
      setQueued(pending.current.length);
      setSync(pending.current.length ? "syncing" : "idle");
    } catch {
      backoff.current = Math.min(30_000, (backoff.current || 1000) * 2);
      setSync("offline");
    } finally {
      inflight.current = false;
    }
  }, [draftId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      void flush();
      timer = setTimeout(tick, Math.max(FLUSH_MS, backoff.current));
    };
    timer = setTimeout(tick, FLUSH_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush(true);
    };
    document.addEventListener("visibilitychange", onHide);
    const onUnload = (e: BeforeUnloadEvent) => {
      if (pending.current.length) {
        void flush(true);
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [flush]);

  // ---------------------------------------------------------------- input capture
  const onBeforeInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const ne = e.nativeEvent as InputEvent;
    inputType.current = ne.inputType || "insertText";
    inputData.current = ne.data ?? null;
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (seqRef.current < 0) return;
    const ta = e.currentTarget;
    const next = ta.value;
    const ne = e.nativeEvent as InputEvent;
    const type = ne.inputType || inputType.current;
    if (next.length > LIMITS.maxContentLength) {
      ta.value = prevValue.current;
      return;
    }
    const { pos, del, ins } = diff(prevValue.current, next, ta.selectionEnd);
    if (del === 0 && ins.length === 0) return;
    let kind = kindFor(type);
    // A keystroke inserts one character. Multi-character inserts come from predictive keyboards,
    // execCommand, extensions or automation, so they are never counted as typed. IME composition is the exception.
    const data = ne.data ?? inputData.current;
    if (kind === "t" && ins.length > 1) {
      const composing = type === "insertCompositionText" && ins.length <= (data?.length ?? 0) && ins.length <= MAX_TYPED_RUN;
      if (!composing) kind = ins.length <= 32 ? "o" : "p";
    }
    const t = Math.max(Date.now(), lastT.current);
    lastT.current = t;
    const ev: EditEvent = [t, pos, del, ins, kind];
    pending.current.push(ev);
    prevValue.current = next;
    setValue(next);
    setOrigins((o) => o.slice(0, pos) + kind.repeat(ins.length) + o.slice(pos + del));
    if (kind === "p" && ins.length) setPastes((n) => n + 1);
    setQueued(pending.current.length);
  };

  const block = (e: React.SyntheticEvent) => {
    if (seqRef.current < 0) e.preventDefault();
  };

  // autosize
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, window.innerHeight * 0.6)}px`;
  }, [value]);

  useEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, []);

  // title autosave
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTitle = (v: string) => {
    setTitle(v);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      void fetch(`/api/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: v }),
      });
    }, 600);
  };

  // ---------------------------------------------------------------- stats
  const stats = useMemo(() => {
    let t = 0,
      p = 0,
      o = 0;
    for (let i = 0; i < origins.length; i++) {
      const c = origins.charCodeAt(i);
      if (c === 116) t++;
      else if (c === 112) p++;
      else o++;
    }
    const n = Math.max(1, origins.length);
    const words = countWords(value);
    return { words, chars: value.length, typed: t / n, pasted: p / n, other: o / n, empty: origins.length === 0 };
  }, [origins, value]);

  const tier = predictTier(stats.empty ? 1 : stats.typed, stats.words);

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-24 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        {error && (
          <div className="mb-6 rounded-2xl border border-wax/40 bg-wax/10 px-4 py-3 text-[14px] text-ink">
            <strong className="font-semibold">Editing paused.</strong> {error}{" "}
            <button className="underline underline-offset-4" onClick={() => location.reload()}>
              Reload the latest version
            </button>
          </div>
        )}
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          maxLength={LIMITS.maxTitleLength}
          placeholder="Untitled"
          aria-label="Title"
          className="display w-full bg-transparent text-[44px] leading-tight outline-none placeholder:text-ink-3/60 sm:text-[56px]"
        />
        <div className="mb-6 mt-3 flex items-center gap-3 text-ink-3">
          <SyncDot state={sync} />
          <span className="label !normal-case !tracking-normal">
            {sync === "conflict"
              ? "paused"
              : sync === "offline"
                ? `offline · ${queued} edits queued`
                : sync === "syncing"
                  ? "witnessing…"
                  : seq === 0
                    ? "start typing: every keystroke is recorded"
                    : `chain #${seq} · ${head.slice(0, 10)}`}
          </span>
        </div>
        <textarea
          ref={taRef}
          className="writer w-full"
          value={value}
          onBeforeInput={onBeforeInput}
          onChange={onChange}
          onKeyDown={block}
          onPaste={block}
          onDrop={block}
          readOnly={sync === "conflict"}
          spellCheck
          placeholder="Begin anywhere. Crest is watching the process, not judging the prose."
          aria-label="Your writing"
        />
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <span className="label">Live record</span>
            <span className="label text-ink-2">{stats.words.toLocaleString()} words</span>
          </div>

          <div className="mt-5">
            <OriginBar typed={stats.typed} pasted={stats.pasted} other={stats.other} empty={stats.empty} />
            <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
              <Stat label="typed" value={stats.empty ? "—" : pct(stats.typed, 0)} dot="bg-typed" />
              <Stat label="pasted" value={stats.empty ? "—" : pct(stats.pasted, 0)} dot="bg-paste" />
              <Stat label="other" value={stats.empty ? "—" : pct(stats.other, 0)} dot="bg-other" />
            </dl>
          </div>

          <div className="mt-6 border-t hairline pt-5">
            <div className="label mb-2">Chain head</div>
            <HashTicker hash={head} />
            <div className="mt-2 flex justify-between text-[12px] text-ink-3">
              <span>{seq} batches witnessed</span>
              <span>{pastes > 0 ? `${pastes} paste${pastes > 1 ? "s" : ""} now` : "no pastes"}</span>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-4 border-t hairline pt-5">
            <Seal hash={head} tier={tier} size={64} ring={false} />
            <div>
              <div className="label">On track for</div>
              <div className="display text-[26px]">{TIER_INFO[tier].label}</div>
            </div>
          </div>

          <button
            className="btn btn-wax mt-6 w-full justify-center"
            disabled={!value.trim() || sync === "conflict"}
            onClick={() => setSealOpen(true)}
          >
            Seal this piece
          </button>
          <p className="mt-3 text-center text-[12px] leading-snug text-ink-3">
            Sealing freezes the text and publishes a signed, replayable record.
          </p>
        </div>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t hairline bg-paper/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <OriginBar typed={stats.typed} pasted={stats.pasted} other={stats.other} empty={stats.empty} />
            <div className="mt-1.5 flex justify-between font-mono text-[11px] text-ink-3">
              <span>{stats.words.toLocaleString()} words</span>
              <span>{stats.empty ? "—" : `${pct(stats.typed, 0)} typed`} · #{seq}</span>
            </div>
          </div>
          <button
            className="btn btn-wax !px-4 !py-2.5"
            disabled={!value.trim() || sync === "conflict"}
            onClick={() => setSealOpen(true)}
          >
            Seal
          </button>
        </div>
      </div>

      {sealOpen && (
        <SealDialog
          title={title}
          onClose={() => setSealOpen(false)}
          words={stats.words}
          tier={tier}
          head={head}
          onSeal={async (opts) => {
            for (let i = 0; i < 40 && (pending.current.length || inflight.current); i++) {
              await flush();
              if (pending.current.length || inflight.current) await new Promise((r) => setTimeout(r, 250));
              if (seqRef.current < 0) throw new Error("This draft changed in another tab.");
            }
            if (pending.current.length) throw new Error("Couldn't reach the server. Check your connection and try again.");
            const res = await fetch(`/api/drafts/${draftId}/seal`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(opts),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? "Sealing failed.");
            router.push(`/c/${body.slug}?sealed=1`);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- bits

function Stat({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-ink-3">
        <span className={`inline-block size-1.5 rounded-full ${dot}`} />
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-[15px] text-ink">{value}</dd>
    </div>
  );
}

function SyncDot({ state }: { state: SyncState }) {
  const color =
    state === "conflict" ? "bg-wax" : state === "offline" ? "bg-paste" : state === "syncing" ? "bg-typed animate-pulse" : "bg-typed";
  return <span className={`inline-block size-2 rounded-full ${color}`} />;
}

function HashTicker({ hash }: { hash: string }) {
  const [shown, setShown] = useState(hash);
  useEffect(() => {
    let frame = 0;
    const chars = "0123456789abcdef";
    const id = setInterval(() => {
      frame++;
      setShown(
        hash
          .split("")
          .map((ch, i) => (i < frame * 4 ? ch : chars[(i * 7 + frame * 3) % 16]))
          .join(""),
      );
      if (frame * 4 >= hash.length) clearInterval(id);
    }, 24);
    return () => clearInterval(id);
  }, [hash]);
  return <code className="block break-all font-mono text-[11.5px] leading-relaxed text-ink-2">{shown}</code>;
}

function SealDialog({
  title,
  words,
  tier,
  head,
  onClose,
  onSeal,
}: {
  title: string;
  words: number;
  tier: Tier;
  head: string;
  onClose: () => void;
  onSeal: (o: { title: string; authorName: string; isPublic: boolean }) => Promise<void>;
}) {
  const [t, setT] = useState(title);
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("crest:name") ?? "";
    } catch {
      return "";
    }
  });
  const [isPublic, setPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-4 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div className="card rise w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="label">Seal & sign</div>
            <h2 className="display mt-1 text-[36px]">Make it permanent</h2>
          </div>
          <Seal hash={head} tier={tier} size={72} ring={false} />
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          The server replays all {words.toLocaleString()} words from the raw log, grades it with fixed rules, and signs
          the result. After that, the text can&apos;t be changed.
        </p>
        <form
          className="mt-5 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              try {
                localStorage.setItem("crest:name", name);
              } catch {}
              await onSeal({ title: t, authorName: name, isPublic });
            } catch (er) {
              setErr(er instanceof Error ? er.message : "Sealing failed.");
              setBusy(false);
            }
          }}
        >
          <label className="block">
            <span className="label">Title</span>
            <input
              value={t}
              onChange={(e) => setT(e.target.value)}
              maxLength={LIMITS.maxTitleLength}
              className="mt-1 w-full rounded-xl border hairline bg-paper px-3 py-2.5 outline-none focus:border-ink-3"
              placeholder="Untitled"
            />
          </label>
          <label className="block">
            <span className="label">Signed as (optional)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={LIMITS.maxNameLength}
              className="mt-1 w-full rounded-xl border hairline bg-paper px-3 py-2.5 outline-none focus:border-ink-3"
              placeholder="Anonymous"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border hairline px-3 py-3">
            <span>
              <span className="block text-[14px] font-medium">List on the public wall</span>
              <span className="block text-[12px] text-ink-3">Unlisted crests are still shareable by link.</span>
            </span>
            <input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} className="size-5 accent-[var(--wax)]" />
          </label>
          {err && <p className="text-[13px] text-wax-text">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>
              Keep writing
            </button>
            <button type="submit" className="btn btn-wax flex-1 justify-center" disabled={busy}>
              {busy ? "Sealing…" : "Seal it"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
