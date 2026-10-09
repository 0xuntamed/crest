import type { NextRequest } from "next/server";
import { getCrest, getDraft, HttpError, sealDraft } from "@/lib/repo";
import { TIER_INFO } from "@/lib/core";
import { siteUrl } from "@/lib/site";
import { extHandle, preflight, requireBearer } from "@/lib/ext";
import { readJson } from "@/lib/http";

export const OPTIONS = preflight;

/** Seals a Google Docs recording against the document text the extension read at seal time. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/ext/drafts/[id]/seal">) {
  return extHandle(async () => {
    const author = await requireBearer(req);
    const { id } = await ctx.params;
    const d = await getDraft(id);
    if (!d || d.source !== "gdocs") throw new HttpError(404, "draft not found");
    const body = await readJson<{ finalText?: unknown; title?: unknown; authorName?: unknown; isPublic?: unknown }>(
      req,
      1_000_000,
    );
    if (typeof body.finalText !== "string") throw new HttpError(400, "finalText required");
    const slug = await sealDraft(id, author.id, {
      finalText: body.finalText,
      title: typeof body.title === "string" ? body.title : d.title,
      authorName: typeof body.authorName === "string" ? body.authorName : "",
      isPublic: body.isPublic !== false,
    });
    const site = await siteUrl();
    const crest = await getCrest(slug);
    return Response.json({ slug, url: `${site}/c/${slug}`, tier: crest ? TIER_INFO[crest.tier].label : null });
  });
}
