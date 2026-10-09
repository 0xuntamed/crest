import Link from "next/link";
import { connection } from "next/server";
import { crestStats, recentCrests } from "@/lib/repo";
import { TIER_INFO, formatDuration, pct } from "@/lib/core";
import { Seal } from "@/components/Seal";
import { HeroDemo } from "@/components/HeroDemo";

const AUDIENCES = [
  ["Students", "Hand in the essay with its replay attached. When a detector flags you, show the record instead of arguing."],
  ["Freelance writers", "Clients worry they're paying for slop. Put a badge on every deliverable that answers the question."],
  ["Job seekers", "A cover letter with a crest link shows it was written for them, not generated in bulk."],
  ["Newsletters & blogs", "Readers who are tired of slop can see that a person sat down and did the work."],
];

export default async function Home() {
  await connection();
  const [crests, stats] = await Promise.all([recentCrests(6), crestStats()]);

  return (
    <div>
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-40 -top-40 size-[640px] rounded-full bg-wax/10 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 md:pt-24 lg:grid-cols-[1.1fr_1fr]">
          <div className="rise">
            <div className="label flex items-center gap-2">
              <span className="inline-block h-px w-8 bg-wax" /> Proof of human authorship
            </div>
            <h1 className="display mt-5 text-[64px] sm:text-[96px] lg:text-[112px]">
              Prove a human <em className="text-wax-text">wrote&nbsp;it.</em>
            </h1>
            <p className="mt-6 max-w-lg text-[18px] leading-relaxed text-ink-2">
              Write in Crest and every keystroke joins a hash-chained, server-witnessed log. Seal it to get a signed
              certificate anyone can replay and verify. AI detectors guess; Crest keeps the record.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a href="/write/new" className="btn btn-wax !px-6 !py-3.5 text-[15px]">
                Start writing. It&apos;s free
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
              </a>
              <Link href="/verify" className="btn btn-ghost !px-6 !py-3.5 text-[15px]">Verify a text</Link>
            </div>
            <p className="label mt-8 !normal-case !tracking-normal">
              No account · no email · {stats.crests.toLocaleString()} {stats.crests === 1 ? "crest" : "crests"} sealed · {stats.keystrokes.toLocaleString()} keystrokes witnessed
            </p>
          </div>

          <div className="relative rise [animation-delay:150ms]">
            <HeroDemo />
            <div className="absolute -bottom-12 -right-4 hidden sm:block lg:-right-10">
              <div className="animate-spin-slow">
                <Seal hash="c8371e5f0a9d24b6e17c3f8a2d95b0e4c61f7a38d2e09b5c4a1f6e3d8b27c905" tier="handwritten" size={150} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- problem */}
      <section className="border-y hairline bg-paper-2/50">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-[1fr_1.2fr]">
          <h2 className="display text-[44px] sm:text-[60px]">
            Detectors are a coin flip <em>with consequences.</em>
          </h2>
          <div className="space-y-5 text-[17px] leading-relaxed text-ink-2">
            <p>
              Students get failed and writers lose clients because a classifier didn&apos;t like their sentence rhythm. The
              accused have no evidence to show except a messy version history.
            </p>
            <p>
              Crest flips it around. Don&apos;t ask a model whether text <em>looks</em> human. Record how it was{" "}
              <em>made</em>, keystroke by keystroke, with a server as witness, and let anyone replay it.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- how */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="label">How it works</div>
        <h2 className="display mt-3 max-w-2xl text-[48px] sm:text-[64px]">Write. Witness. Seal.</h2>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <article className="card flex flex-col p-7">
            <span className="font-mono text-[12px] text-wax-text">01 / write</span>
            <h3 className="display mt-3 text-[34px]">A calm place to write</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
              A distraction-free editor in a reading serif. Behind it, every insert, delete, paste and undo becomes an event.
            </p>
            <div className="mt-auto pt-8 font-mono text-[11.5px] leading-6 text-ink-3">
              <div>[t, pos, del, ins, kind]</div>
              <div className="text-ink-2">[1759561200412, 214, 0, &quot;r&quot;, &quot;t&quot;]</div>
              <div className="text-ink-2">[1759561200530, 215, 0, &quot;e&quot;, &quot;t&quot;]</div>
              <div><span className="o-p px-0.5 text-ink-2">[1759561203004, 216, 0, &quot;…&quot;, &quot;p&quot;]</span></div>
            </div>
          </article>
          <article className="card flex flex-col p-7">
            <span className="font-mono text-[12px] text-wax-text">02 / witness</span>
            <h3 className="display mt-3 text-[34px]">A chain the server signs off</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
              Every second, a batch is replayed, timestamped and hashed onto the last. Time claimed by the client has to
              match time the server saw.
            </p>
            <div className="mt-auto flex items-center gap-1.5 pt-8">
              {["9f3a", "07c1", "e54d", "b2a8", "41fe"].map((h, i) => (
                <div key={h} className="flex items-center gap-1.5">
                  <span className="rounded-md border hairline bg-paper px-2 py-1 font-mono text-[11px] text-ink-2">{h}</span>
                  {i < 4 && <span className="h-px w-2 bg-rule" />}
                </div>
              ))}
            </div>
          </article>
          <article className="card flex flex-col p-7">
            <span className="font-mono text-[12px] text-wax-text">03 / seal</span>
            <h3 className="display mt-3 text-[34px]">A seal nobody can forge</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
              The server replays everything, grades it with fixed public rules, and signs it. Each seal&apos;s artwork is
              generated from its own hash.
            </p>
            <div className="mt-auto flex gap-3 pt-6">
              <Seal hash="3e9a17c0b4d25f8e6a1c9073d4b2e8f15a6c0d9e7b3f2a4c8d1e5b6f9a0c7d3e" tier="handwritten" size={64} ring={false} />
              <Seal hash="a07c5e3f9b2d18e4c6a0f7d3b9e1c5a28f4d6b0e3c7a9f1d5b2e8c4a6f0d9b3e" tier="human-led" size={64} ring={false} />
              <Seal hash="5d1f9b3e7a0c4d8f2b6e1a5c9d3f7b0e4a8c2d6f1b5e9a3c7d0f4b8e2a6c1d5f" tier="assisted" size={64} ring={false} />
            </div>
          </article>
        </div>
      </section>

      {/* ---------------------------------------------------------------- who */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-px overflow-hidden rounded-[20px] border hairline bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map(([h, p]) => (
            <div key={h} className="bg-paper p-7">
              <h3 className="display text-[30px]">{h}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- wall */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="label">The wall</div>
            <h2 className="display mt-3 text-[48px] sm:text-[64px]">Freshly sealed</h2>
          </div>
          <a href="/write/new" className="btn btn-ghost">Add yours</a>
        </div>
        {crests.length === 0 ? (
          <div className="card mt-10 flex flex-col items-center px-6 py-16 text-center">
            <Seal hash="0000c0ffee0000c0ffee0000c0ffee0000c0ffee0000c0ffee0000c0ffee0000" tier="assembled" size={96} ring={false} />
            <p className="display mt-6 text-[32px]">The wall is waiting for its first crest.</p>
            <a href="/write/new" className="btn btn-wax mt-6">Be the first</a>
          </div>
        ) : (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {crests.map((c) => (
              <Link key={c.slug} href={`/c/${c.slug}`} className="card group flex flex-col p-6 transition hover:-translate-y-1 hover:shadow-[0_20px_50px_-30px_rgba(60,30,10,.5)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="label">{TIER_INFO[c.tier].label}</div>
                    <h3 className="display mt-1 line-clamp-2 text-[30px] group-hover:text-wax-text">{c.title || "Untitled"}</h3>
                  </div>
                  <Seal hash={c.chain_head} tier={c.tier} size={56} ring={false} className="shrink-0 transition-transform duration-700 group-hover:rotate-45" />
                </div>
                <p className="prose-read mt-3 line-clamp-4 !text-[15px] !leading-relaxed text-ink-2">{c.excerpt}</p>
                <div className="mt-auto flex justify-between pt-5 font-mono text-[11px] text-ink-3">
                  <span>{c.author_name || "anonymous"}</span>
                  <span>{c.words.toLocaleString()} words · {pct(c.typed_share, 0)} typed · {formatDuration(Number(c.active_ms))}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- cta */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[28px] bg-ink px-8 py-16 text-paper sm:px-14">
          <div className="pointer-events-none absolute -right-16 -top-16 opacity-90">
            <div className="animate-spin-slow">
              <Seal hash="ffc8371e00a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5061728394a5" tier="handwritten" size={260} />
            </div>
          </div>
          <h2 className="display relative max-w-xl text-[48px] sm:text-[72px]">
            Your words. <em>Your receipts.</em>
          </h2>
          <p className="relative mt-4 max-w-md text-[16px] text-paper/70">
            The next time someone asks whether you used AI, send them a link instead of an argument.
          </p>
          <a href="/write/new" className="btn btn-wax relative mt-8 !px-6 !py-3.5">Start writing</a>
        </div>
      </section>
    </div>
  );
}
