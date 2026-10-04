import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCrest } from "@/lib/repo";
import { TIER_INFO, formatDuration, pct } from "@/lib/core";
import { Seal } from "@/components/Seal";
import { TIER_COLORS } from "@/lib/seal";
import { CrestReader } from "@/components/CrestReader";
import { VerifyPanel } from "@/components/VerifyPanel";
import { EmbedBox } from "@/components/EmbedBox";
import { GrowthChart, RhythmChart } from "@/components/Charts";
import { OriginBar } from "@/components/OriginBar";

export async function generateMetadata(props: PageProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const c = await getCrest(slug);
  if (!c) return { title: "Not found" };
  const by = c.author_name ? ` by ${c.author_name}` : "";
  return {
    title: c.title || "Untitled",
    description: `${TIER_INFO[c.tier].label}${by}. ${c.metrics.words} words, ${pct(c.metrics.typedShare, 0)} typed, written over ${formatDuration(c.metrics.activeMs)}. Verified by Crest.`,
    robots: c.is_public ? undefined : { index: false },
  };
}

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" });

export default async function CrestPage(props: PageProps<"/c/[slug]">) {
  const { slug } = await props.params;
  const { sealed } = await props.searchParams;
  const c = await getCrest(slug);
  if (!c) notFound();
  const m = c.metrics;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const info = TIER_INFO[c.tier];

  const facts: Array<[string, string, string?]> = [
    ["Words", m.words.toLocaleString()],
    ["Writing time", formatDuration(m.activeMs), `${m.sessions} session${m.sessions === 1 ? "" : "s"} over ${formatDuration(m.spanMs)}`],
    ["Typed here", pct(m.typedShare), `${m.inserted.t.toLocaleString()} keystrokes`],
    ["Pasted", pct(m.pastedShare), m.pasteEvents ? `${m.pasteEvents} paste${m.pasteEvents > 1 ? "s" : ""}, largest ${m.largestPaste.toLocaleString()} chars` : "none at all"],
    ["Revisions", m.deleted.toLocaleString(), `chars deleted · ${m.revisionRatio}× final length`],
    ["Pace", `${m.wpm} wpm`, `${m.pauses.toLocaleString()} thinking pauses`],
    ["Server-witnessed", pct(m.witnessedShare), `${c.chain_length} batches in the chain`],
    ["Edit events", m.events.toLocaleString(), "replayable, in order"],
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-16">
      {/* hero */}
      <section className="grid items-center gap-10 md:grid-cols-[1fr_auto]">
        <div className="rise order-2 md:order-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label">Crest №{c.slug}</span>
            {!c.is_public && <span className="label rounded-full bg-paper-2 px-2 py-0.5">unlisted</span>}
          </div>
          <h1 className="display mt-3 text-[52px] sm:text-[80px]">{c.title || "Untitled"}</h1>
          <p className="mt-4 text-[17px] text-ink-2">
            {c.author_name ? <>Written by <span className="text-ink">{c.author_name}</span></> : "Written anonymously"} ·
            sealed {dateFmt.format(c.sealed_at)} UTC
          </p>
          <div className="mt-6 inline-flex items-center gap-3 rounded-full border hairline bg-card py-1.5 pl-1.5 pr-4">
            <span
              className="rounded-full px-3 py-1 font-mono text-[12px] font-semibold uppercase tracking-wider text-white"
              style={{ background: TIER_COLORS[c.tier].wax }}
            >
              {info.label}
            </span>
            <span className="text-[14px] text-ink-2">{info.blurb}</span>
          </div>
        </div>
        <div className={`order-1 mx-auto md:order-2 ${sealed ? "stamp" : "rise"}`}>
          <Seal hash={c.chain_head} tier={c.tier} size={260} className="hover:animate-spin-slow" />
        </div>
      </section>

      {/* facts */}
      <section className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border hairline bg-rule md:grid-cols-4">
        {facts.map(([k, v, sub]) => (
          <div key={k} className="bg-paper px-4 py-6 sm:px-5">
            <div className="label">{k}</div>
            <div className="display mt-2 text-[34px] sm:text-[40px]">{v}</div>
            {sub && <div className="mt-1 text-[12.5px] leading-snug text-ink-3">{sub}</div>}
          </div>
        ))}
      </section>

      {/* charts */}
      <section className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="card p-6">
          <div className="label">Where the text came from</div>
          <div className="mt-6">
            <OriginBar typed={m.typedShare} pasted={m.pastedShare} other={m.otherShare} />
          </div>
          <dl className="mt-4 space-y-1.5 text-[13px]">
            <div className="flex justify-between"><dt className="text-ink-2">Typed in Crest</dt><dd className="font-mono">{pct(m.typedShare)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Pasted or dropped</dt><dd className="font-mono">{pct(m.pastedShare)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">Undo / autocorrect</dt><dd className="font-mono">{pct(m.otherShare)}</dd></div>
          </dl>
        </div>
        <div className="card p-6">
          <div className="label mb-5">Keystroke rhythm</div>
          <RhythmChart rhythm={m.rhythm} />
        </div>
        <div className="card p-6">
          <div className="label mb-5">How it grew</div>
          <GrowthChart growth={m.growth} />
          <p className="mt-2 text-[12px] text-ink-3">Length over active writing time. A paste shows up as a sudden cliff.</p>
        </div>
      </section>

      {/* text */}
      <section className="mt-8">
        <CrestReader slug={c.slug} content={c.content} origins={c.origins} />
      </section>

      {/* verify / embed */}
      <section className="mt-8 grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <VerifyPanel slug={c.slug} />
        <EmbedBox slug={c.slug} site={site} label={info.label} />
      </section>

      <section className="mt-8 grid gap-6 rounded-[20px] border hairline p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <div className="label">Chain head</div>
          <code className="mt-1 block break-all font-mono text-[12px] text-ink-2">{c.chain_head}</code>
          <div className="label mt-3">Content sha256</div>
          <code className="mt-1 block break-all font-mono text-[12px] text-ink-2">{c.content_hash}</code>
        </div>
        <div className="flex flex-wrap gap-3">
          <a className="btn btn-ghost" href={`/api/crests/${c.slug}/log`} download={`crest-${c.slug}.json`}>Download raw log</a>
          <Link className="btn btn-ghost" href="/method">How grading works</Link>
        </div>
      </section>
    </div>
  );
}
