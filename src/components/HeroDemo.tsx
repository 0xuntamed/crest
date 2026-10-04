"use client";

import { useEffect, useRef, useState } from "react";
import { sha256Hex } from "@/lib/core";
import { OriginText } from "./OriginText";

type Op = { type: "type"; text: string } | { type: "back"; n: number } | { type: "paste"; text: string } | { type: "wait"; ms: number };

const SCRIPT: Op[] = [
  { type: "type", text: "I rewrote this opening line nine times" },
  { type: "wait", ms: 700 },
  { type: "back", n: 10 },
  { type: "type", text: "eleven times." },
  { type: "wait", ms: 500 },
  { type: "type", text: " As my editor put it, " },
  { type: "paste", text: "“the first draft is just you telling yourself the story.”" },
  { type: "wait", ms: 600 },
  { type: "type", text: " This one is mine." },
  { type: "wait", ms: 2600 },
];

/** mulberry32: a tiny seeded PRNG, so the demo types with the same human-ish rhythm every time */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function HeroDemo() {
  const [text, setText] = useState("");
  const [origins, setOrigins] = useState("");
  const [head, setHead] = useState("0".repeat(64));
  const [n, setN] = useState(0);
  const state = useRef({ text: "", origins: "", head: "", n: 0 });

  useEffect(() => {
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    async function commit(text: string, origins: string) {
      const s = state.current;
      s.n++;
      s.head = await sha256Hex(`${s.head}\n${s.n}\n${text}`);
      s.text = text;
      s.origins = origins;
      if (cancelled) return;
      setText(text);
      setOrigins(origins);
      setHead(s.head);
      setN(s.n);
    }

    async function loop() {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      while (!cancelled) {
        const r = rng(20261004);
        state.current = { text: "", origins: "", head: await sha256Hex("crest/demo"), n: 0 };
        await commit("", "");
        for (const op of SCRIPT) {
          if (cancelled) return;
          const s = state.current;
          if (op.type === "wait") await sleep(op.ms);
          else if (op.type === "paste") {
            await sleep(350);
            await commit(s.text + op.text, s.origins + "p".repeat(op.text.length));
          } else if (op.type === "back") {
            for (let i = 0; i < op.n; i++) {
              const c = state.current;
              await commit(c.text.slice(0, -1), c.origins.slice(0, -1));
              await sleep(45 + r() * 40);
            }
          } else {
            for (const ch of op.text) {
              const c = state.current;
              await commit(c.text + ch, c.origins + "t");
              const base = ch === " " ? 120 : 55;
              await sleep(reduce ? 5 : base + r() * 110 + (r() > 0.94 ? 380 : 0));
            }
          }
        }
        if (reduce) return;
      }
    }
    void loop();
    return () => {
      cancelled = true;
    };
  }, []);

  const pasted = origins.split("").filter((c) => c === "p").length;
  const typed = origins.length - pasted;

  return (
    <div className="card relative w-full overflow-hidden shadow-[0_30px_80px_-40px_rgba(60,30,10,0.45)]">
      <div className="flex items-center justify-between border-b hairline px-5 py-3">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-rule" />
          <span className="size-2.5 rounded-full bg-rule" />
          <span className="size-2.5 rounded-full bg-rule" />
        </div>
        <span className="label flex items-center gap-2 !normal-case !tracking-normal">
          <span className="size-1.5 animate-pulse rounded-full bg-typed" /> recording
        </span>
      </div>
      <div className="prose-read min-h-[190px] px-6 py-6 !text-[19px] sm:min-h-[170px]">
        <OriginText content={text} origins={origins} highlight caretAt={text.length} />
      </div>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 border-t hairline bg-paper-2/60 px-5 py-3 font-mono text-[11px] text-ink-3">
        <span>event</span>
        <span className="text-ink-2">#{String(n).padStart(4, "0")} · {typed} typed · {pasted} pasted</span>
        <span>chain</span>
        <span className="truncate text-ink-2">{head}</span>
      </div>
    </div>
  );
}
