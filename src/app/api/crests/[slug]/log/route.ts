import type { NextRequest } from "next/server";
import { getCrest, HttpError, loadLog } from "@/lib/repo";
import { handle } from "@/lib/http";

/** The full, raw, append-only log behind a crest. Anyone can re-hash and replay it. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/crests/[slug]/log">) {
  return handle(async () => {
    const { slug } = await ctx.params;
    const crest = await getCrest(slug);
    if (!crest) throw new HttpError(404, "crest not found");
    const log = await loadLog(crest.draft_id);
    if (!log) throw new HttpError(404, "log not found");
    return Response.json(
      {
        ...log,
        seal: {
          slug: crest.slug,
          contentHash: crest.content_hash,
          chainHead: crest.chain_head,
          chainLength: crest.chain_length,
          tier: crest.tier,
          sealedMs: crest.sealed_at.getTime(),
          signature: crest.signature,
        },
      },
      { headers: { "cache-control": "public, max-age=31536000, immutable" } },
    );
  });
}
