import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { currentAuthor } from "@/lib/auth";
import { listDrafts } from "@/lib/repo";
import { TIER_INFO } from "@/lib/core";
import { DeleteDraftButton } from "@/components/DeleteDraftButton";

export const metadata: Metadata = { title: "My drafts", robots: { index: false } };

const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function DraftsPage() {
  await connection();
  const author = await currentAuthor();
  const drafts = author ? await listDrafts(author.id) : [];

  return (
    <div className="mx-auto max-w-4xl px-4 pt-14 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label">Your desk</div>
          <h1 className="display mt-2 text-[56px] sm:text-[72px]">Drafts & crests</h1>
        </div>
        <a href="/write/new" className="btn btn-wax">New piece</a>
      </div>
      <p className="mt-3 max-w-xl text-[15px] text-ink-2">
        Drafts are tied to this browser. There&apos;s no account, no email and no password, so keep the cookie or seal your work.
      </p>

      {drafts.length === 0 ? (
        <div className="card mt-10 grid place-items-center px-6 py-20 text-center">
          <p className="display text-[34px]">An empty desk.</p>
          <p className="mt-2 text-ink-2">Everything you write here gets its own chain of custody.</p>
          <a href="/write/new" className="btn btn-wax mt-6">Start your first piece</a>
        </div>
      ) : (
        <ul className="mt-10 divide-y divide-[var(--rule)] border-y hairline">
          {drafts.map((d) => {
            const href = d.status === "sealed" && d.slug ? `/c/${d.slug}` : `/write/${d.id}`;
            return (
              <li key={d.id} className="group flex items-start gap-4 py-5">
                <Link href={href} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="display truncate text-[28px] group-hover:text-wax-text">{d.title || "Untitled"}</h2>
                    {d.status === "sealed" && d.tier ? (
                      <span className="rounded-full bg-wax/10 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-wax-text">
                        sealed · {TIER_INFO[d.tier].label}
                      </span>
                    ) : (
                      <span className="rounded-full bg-paper-2 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-ink-3">
                        open · {d.seq} batches
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[14px] text-ink-2">{d.preview || <em className="text-ink-3">Nothing yet.</em>}</p>
                  <p className="label mt-2 !text-[10px]">
                    {fmt.format(d.updated_at)} · {d.length.toLocaleString()} chars
                  </p>
                </Link>
                {d.status === "open" && <DeleteDraftButton id={d.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
