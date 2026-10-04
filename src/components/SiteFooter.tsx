import Link from "next/link";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t hairline">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <Logo />
            <span className="display text-2xl">Crest</span>
          </div>
          <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-ink-2">
            Proof of process, not proof of genius. Crest records how words were made so nobody has to guess.
          </p>
        </div>
        <div className="text-[14px]">
          <div className="label mb-3">Product</div>
          <ul className="space-y-2 text-ink-2">
            <li><a href="/write/new" className="hover:text-ink">Start writing</a></li>
            <li><Link href="/drafts" className="hover:text-ink">My drafts</Link></li>
            <li><Link href="/verify" className="hover:text-ink">Verify a text</Link></li>
          </ul>
        </div>
        <div className="text-[14px]">
          <div className="label mb-3">Trust</div>
          <ul className="space-y-2 text-ink-2">
            <li><Link href="/method" className="hover:text-ink">How grading works</Link></li>
            <li><a href="/api/pubkey" className="hover:text-ink">Signing public key</a></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <p className="label">No AI detectors · No guesswork · Just the record</p>
      </div>
    </footer>
  );
}
