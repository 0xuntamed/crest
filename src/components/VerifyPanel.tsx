"use client";

import { useState } from "react";
import {
  TIER_INFO,
  computeMetrics,
  gradeTier,
  sha256Hex,
  signaturePayload,
  slugFromHead,
  verifyChain,
  type CrestLog,
  type Tier,
} from "@/lib/core";
import { fetchLog } from "./CrestReader";

type SealInfo = {
  slug: string;
  contentHash: string;
  chainHead: string;
  chainLength: number;
  tier: Tier;
  sealedMs: number;
  signature: string;
};

type Step = { label: string; status: "wait" | "run" | "ok" | "fail"; detail?: string };

const STEPS = [
  "Download the raw keystroke log",
  "Re-hash every batch in the chain",
  "Replay edits and match the sealed text",
  "Re-grade with the published rules",
  "Check the server's Ed25519 signature",
];

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function VerifyPanel({ slug }: { slug: string }) {
  const [steps, setSteps] = useState<Step[]>(STEPS.map((label) => ({ label, status: "wait" })));
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState<null | boolean>(null);

  const set = (i: number, status: Step["status"], detail?: string) =>
    setSteps((s) => s.map((x, j) => (j === i ? { ...x, status, detail } : x)));
  const pause = () => new Promise((r) => setTimeout(r, 280));

  async function run() {
    setRunning(true);
    setVerdict(null);
    setSteps(STEPS.map((label) => ({ label, status: "wait" })));
    let i = 0;
    try {
      set(i, "run");
      const log = (await fetchLog(slug)) as CrestLog & { seal: SealInfo };
      const seal = log.seal;
      const bytes = log.batches.reduce((n, b) => n + b.eventsJson.length, 0);
      await pause();
      set(i, "ok", `${log.batches.length} batches · ${(bytes / 1024).toFixed(1)} KB`);

      i = 1;
      set(i, "run");
      const check = await verifyChain(log);
      await pause();
      if (!check.ok) throw new Error(`batch ${check.atSeq}: ${check.reason}`);
      if (check.head !== seal.chainHead || check.length !== seal.chainLength || slugFromHead(check.head) !== seal.slug)
        throw new Error("chain head doesn't match the seal");
      set(i, "ok", `head ${check.head.slice(0, 16)}…`);

      i = 2;
      set(i, "run");
      const contentHash = await sha256Hex(check.doc.content);
      await pause();
      if (contentHash !== seal.contentHash) throw new Error("replayed text differs from sealed text");
      set(i, "ok", `sha256 ${contentHash.slice(0, 16)}…`);

      i = 3;
      set(i, "run");
      const tier = gradeTier(computeMetrics(log, check.doc));
      await pause();
      if (tier !== seal.tier) throw new Error(`re-graded as ${tier}, sealed as ${seal.tier}`);
      set(i, "ok", `${TIER_INFO[tier].label}, same as sealed`);

      i = 4;
      set(i, "run");
      const pk = (await fetch("/api/pubkey").then((r) => r.json())) as { spki: string };
      let ok: boolean;
      try {
        const key = await crypto.subtle.importKey("spki", b64(pk.spki), { name: "Ed25519" }, false, ["verify"]);
        ok = await crypto.subtle.verify(
          { name: "Ed25519" },
          key,
          b64(seal.signature),
          new TextEncoder().encode(
            signaturePayload({
              slug: seal.slug,
              contentHash: seal.contentHash,
              chainHead: seal.chainHead,
              chainLength: seal.chainLength,
              tier: seal.tier,
              sealedMs: seal.sealedMs,
            }),
          ),
        );
      } catch {
        set(i, "fail", "This browser can't verify Ed25519 signatures yet.");
        setVerdict(null);
        return;
      }
      await pause();
      if (!ok) throw new Error("signature invalid");
      set(i, "ok", `key ${pk.spki.slice(-12)}`);
      setVerdict(true);
    } catch (e) {
      set(i, "fail", e instanceof Error ? e.message : "failed");
      setVerdict(false);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="label">Don&apos;t trust, verify</div>
          <h3 className="display mt-1 text-[32px]">Check it yourself</h3>
          <p className="mt-1 max-w-md text-[14px] text-ink-2">
            Your browser downloads the raw log and redoes every check the server did. Nothing is taken on faith.
          </p>
        </div>
        {verdict === true && (
          <span className="stamp shrink-0 rounded-full border-2 border-typed px-3 py-1 font-mono text-[12px] font-semibold uppercase tracking-wider text-typed">
            Verified
          </span>
        )}
        {verdict === false && (
          <span className="stamp shrink-0 rounded-full border-2 border-wax px-3 py-1 font-mono text-[12px] font-semibold uppercase tracking-wider text-wax">
            Failed
          </span>
        )}
      </div>
      <ol className="mt-5 space-y-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 text-[14px]">
            <StepIcon status={s.status} />
            <div className="min-w-0">
              <div className={s.status === "wait" ? "text-ink-3" : "text-ink"}>{s.label}</div>
              {s.detail && (
                <div className={`truncate font-mono text-[11.5px] ${s.status === "fail" ? "text-wax" : "text-ink-3"}`}>{s.detail}</div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <button onClick={run} disabled={running} className="btn btn-ghost mt-6 w-full justify-center">
        {running ? "Verifying…" : verdict === null ? "Run verification" : "Run again"}
      </button>
    </div>
  );
}

function StepIcon({ status }: { status: Step["status"] }) {
  if (status === "ok")
    return (
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-typed text-white">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.2l2 2L8 3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
      </span>
    );
  if (status === "fail")
    return <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-wax text-[11px] font-bold text-white">!</span>;
  if (status === "run")
    return <span className="mt-0.5 size-5 shrink-0 animate-spin rounded-full border-2 border-rule border-t-wax" />;
  return <span className="mt-0.5 size-5 shrink-0 rounded-full border border-rule" />;
}
