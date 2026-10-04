"use client";

import Link from "next/link";
import { useState } from "react";
import { TIER_INFO, type Tier } from "@/lib/core";

type Result = {
  match: "exact" | "excerpt" | "none";
  crests: { slug: string; title: string; author_name: string; tier: Tier; sealed_at: string }[];
};

export function VerifyForm() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          setRes(null);
          try {
            const r = await fetch("/api/verify", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ text }),
            });
            const body = await r.json();
            if (!r.ok) throw new Error(body.error ?? "Lookup failed");
            setRes(body);
          } catch (er) {
            setErr(er instanceof Error ? er.message : "Lookup failed");
          } finally {
            setBusy(false);
          }
        }}
        className="card overflow-hidden"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={9}
          placeholder="Paste an essay, a post, a cover letter, or just a paragraph from one…"
          className="prose-read block w-full resize-y bg-transparent px-6 py-5 !text-[17px] outline-none placeholder:italic placeholder:text-ink-3"
        />
        <div className="flex items-center justify-between gap-4 border-t hairline px-4 py-3">
          <span className="label !normal-case !tracking-normal">
            Case, quotes and whitespace are ignored. A paragraph of 60+ characters can match a longer piece.
          </span>
          <button className="btn btn-wax shrink-0" disabled={busy || text.trim().length < 20}>
            {busy ? "Checking…" : "Check for a crest"}
          </button>
        </div>
      </form>

      {err && <p className="mt-4 text-wax">{err}</p>}

      {res && (
        <div className="rise mt-8">
          {res.match === "none" ? (
            <div className="card px-6 py-10 text-center">
              <p className="display text-[34px]">No crest found.</p>
              <p className="mx-auto mt-2 max-w-md text-[15px] text-ink-2">
                That doesn&apos;t mean a machine wrote it. It only means this text wasn&apos;t written and sealed in Crest. If
                it matters, ask the author for their crest link.
              </p>
            </div>
          ) : (
            <div>
              <p className="label mb-3">
                {res.match === "exact" ? "Exact match" : "This passage appears inside"} · {res.crests.length} crest
                {res.crests.length > 1 ? "s" : ""}
              </p>
              <ul className="space-y-3">
                {res.crests.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/c/${c.slug}`} className="card flex items-center justify-between gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                      <div className="min-w-0">
                        <div className="display truncate text-[28px]">{c.title || "Untitled"}</div>
                        <div className="text-[13px] text-ink-3">
                          {c.author_name || "Anonymous"} · sealed {new Date(c.sealed_at).toLocaleDateString()}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-wax px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-white">
                        {TIER_INFO[c.tier].label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {res.crests.length > 1 && (
                <p className="mt-3 text-[13px] text-ink-3">
                  Several crests contain this text. The earliest seal is listed first, and the replay shows who actually typed it.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
