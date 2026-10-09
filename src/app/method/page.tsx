import type { Metadata } from "next";
import { RULES, TIER_INFO, type Tier } from "@/lib/core";
import { Seal } from "@/components/Seal";

export const metadata: Metadata = {
  title: "Method",
  description: "Exactly how Crest records, chains, grades and signs writing. Fixed rules, open to inspection.",
};

const t = RULES.tiers;
const TIERS: Array<[Tier, string, string]> = [
  ["handwritten", "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9", `≥ ${t.handwritten.typed * 100}% of the final text typed · ≥ ${t.handwritten.witnessed * 100}% witnessed · ≥ ${t.handwritten.minWords} words`],
  ["human-led", "f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f", `≥ ${t.humanLed.typed * 100}% typed · ≥ ${t.humanLed.witnessed * 100}% witnessed`],
  ["assisted", "5a5b5c5d5e5f606162636465666768697a7b7c7d7e7f80818283848586878889", `≥ ${t.assisted.typed * 100}% typed`],
  ["assembled", "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0", "everything else"],
];

const STEPS = [
  {
    n: "01",
    h: "Every edit is an event",
    p: "The editor turns each change into one splice: time, position, characters removed, characters added, and how they arrived (typed, pasted, or undo/autocorrect). If text shows up without a matching keystroke, for example from a script or an extension, it counts as pasted.",
  },
  {
    n: "02",
    h: "Events are chained and witnessed",
    p: "About once a second, the browser sends a batch of events. The server replays the batch against its own copy, stamps it with server time, and hashes it together with the previous batch: sha256(prev ∥ seq ∥ server_ms ∥ events). Changing any keystroke breaks every hash after it.",
  },
  {
    n: "03",
    h: "Time can't be faked after the fact",
    p: `A batch counts as witnessed only if the writing time the client claims fits inside the time the server actually saw pass, within ${RULES.witnessToleranceMs / 1000}s. A fake log uploaded all at once claims hours that the server never saw.`,
  },
  {
    n: "04",
    h: "Sealing replays everything",
    p: "To seal, the server replays the whole chain from the genesis hash, checks that it rebuilds the exact final text, computes the metrics, applies the tier rules below, and signs the result with Ed25519.",
  },
  {
    n: "05",
    h: "Anyone can re-check",
    p: "Every crest page has a Verify button. It downloads the raw log and repeats every step in your browser: the hashes, the replay, the grading, and the signature. The code is the same; nothing is taken on faith.",
  },
];

export default function MethodPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-14 sm:px-6 sm:pt-20">
      <div className="label">Method · v1</div>
      <h1 className="display mt-3 max-w-3xl text-[56px] sm:text-[88px]">
        Fixed rules. <em className="text-wax-text">No oracle.</em>
      </h1>
      <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-2">
        AI detectors guess, and they wrongly accuse real people. Crest doesn&apos;t look at your prose at all. It records how
        the text was made, then applies the arithmetic below. Same log in, same verdict out, every time.
      </p>

      <ol className="mt-16 border-t hairline">
        {STEPS.map((s) => (
          <li key={s.n} className="grid gap-4 border-b hairline py-8 md:grid-cols-[120px_1fr_1.4fr]">
            <span className="font-mono text-[13px] text-wax-text">{s.n}</span>
            <h2 className="display text-[32px]">{s.h}</h2>
            <p className="text-[15.5px] leading-relaxed text-ink-2">{s.p}</p>
          </li>
        ))}
      </ol>

      <section className="mt-20">
        <div className="label">The tiers</div>
        <h2 className="display mt-2 text-[48px]">Four seals, checked in order</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {TIERS.map(([tier, hash, rule]) => (
            <div key={tier} className="card flex items-center gap-5 p-5">
              <Seal hash={hash} tier={tier} size={92} ring={false} />
              <div>
                <div className="display text-[30px]">{TIER_INFO[tier].label}</div>
                <div className="mt-1 font-mono text-[12px] text-ink-2">{rule}</div>
                <div className="mt-1 text-[13px] text-ink-3">{TIER_INFO[tier].blurb}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-[14px] leading-relaxed text-ink-3">
          &quot;Typed share&quot; is measured on the <em>final</em> text: every character surviving in the sealed piece carries
          the origin of the event that inserted it. Writing time adds up gaps under {RULES.activeGapCapMs / 60000} minutes.
          A gap of {RULES.sessionGapMs / 60000}+ minutes starts a new session. A pause of {RULES.pauseMinMs / 1000}s or more
          counts as a thinking pause.
        </p>
      </section>

      <section id="google-docs" className="mt-20 scroll-mt-24">
        <div className="label">Google Docs crests</div>
        <h2 className="display mt-2 max-w-3xl text-[48px]">Same chain, coarser lens</h2>
        <div className="mt-6 grid gap-8 md:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4 text-[15.5px] leading-relaxed text-ink-2">
            <p>
              Google Docs draws text on a canvas, so the Crest extension can&apos;t see where the cursor is. It records what it
              can see reliably: every keystroke, paste (with its text), delete, undo, and caret move, plus a snapshot of the
              document when recording starts. These events go into the same server-witnessed hash chain.
            </p>
            <p>
              When you seal, the extension reads the document&apos;s text. There&apos;s no replay. Instead, every word of the final
              text is attributed, in this order: exact pasted passages, paragraphs that were already in the snapshot, then word
              by word, crediting a word as <em>typed</em> only if it appeared in the recorded typing. Anything left over is{" "}
              <strong className="text-ink">unaccounted</strong> and counts against the typed share.
            </p>
          </div>
          <div className="card p-6 text-[14px] leading-relaxed">
            <div className="label mb-3">Why this holds up</div>
            <ul className="space-y-2.5 text-ink-2">
              <li>✓ Turning the extension off to paste leaves those words unaccounted.</li>
              <li>✓ Typing junk to pump up keystroke counts doesn&apos;t help: the junk&apos;s words aren&apos;t the essay&apos;s words.</li>
              <li>✓ Text from collaborators or other devices shows up as unaccounted, not typed.</li>
              <li className="text-ink-3">✕ Highlighting is per word, not per keystroke, and there&apos;s no replay.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-20 grid gap-8 md:grid-cols-2">
        <div className="card p-7">
          <div className="label">What a crest proves</div>
          <ul className="mt-4 space-y-3 text-[15px] leading-relaxed">
            <li>✓ The text was produced inside Crest by the edits on record, in that order.</li>
            <li>✓ The edits happened over real time the server actually observed.</li>
            <li>✓ How much was pasted, and exactly which characters.</li>
            <li>✓ Nobody has changed the log or the text since sealing.</li>
          </ul>
        </div>
        <div className="card p-7">
          <div className="label">What it can&apos;t prove</div>
          <ul className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink-2">
            <li>✕ That the ideas are original. Someone can retype text they read elsewhere, though the rhythm chart and replay usually show it: steady pace, almost no revisions.</li>
            <li>✕ Who sat at the keyboard. Crest proves the process, not the person.</li>
            <li>✕ Resistance to a patient attacker scripting fake keystrokes in real time. Crest makes faking cost hours instead of seconds.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
