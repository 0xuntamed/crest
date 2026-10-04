import Link from "next/link";
import { Logo } from "./Logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b hairline bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="Crest home">
          <Logo />
          <span className="display text-[26px] leading-none">Crest</span>
        </Link>
        <nav className="flex items-center gap-1 text-[14px] text-ink-2">
          <Link href="/verify" className="hidden rounded-full px-3 py-1.5 hover:bg-paper-2 hover:text-ink sm:block">
            Verify
          </Link>
          <Link href="/method" className="hidden rounded-full px-3 py-1.5 hover:bg-paper-2 hover:text-ink sm:block">
            Method
          </Link>
          <Link href="/drafts" className="rounded-full px-3 py-1.5 hover:bg-paper-2 hover:text-ink">
            My drafts
          </Link>
          <a href="/write/new" className="btn btn-wax ml-2 !py-2 !px-4">
            Start writing
          </a>
        </nav>
      </div>
    </header>
  );
}
