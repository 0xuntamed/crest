import type { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { deleteDraft, getDraft, HttpError } from "@/lib/repo";
import { extHandle, preflight, requireBearer } from "@/lib/ext";

export const OPTIONS = preflight;

export async function GET(req: NextRequest, ctx: RouteContext<"/api/ext/drafts/[id]">) {
  return extHandle(async () => {
    const author = await requireBearer(req);
    const { id } = await ctx.params;
    const d = await getDraft(id);
    if (!d || d.author_id !== author.id || d.source !== "gdocs") throw new HttpError(404, "draft not found");
    const { rows } = await pool.query<{ slug: string }>("select slug from crests where draft_id = $1", [id]);
    return Response.json({ draftId: d.id, seq: d.seq, headHash: d.head_hash, status: d.status, slug: rows[0]?.slug ?? null });
  });
}

/** Stops and discards an open recording. */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/ext/drafts/[id]">) {
  return extHandle(async () => {
    const author = await requireBearer(req);
    const { id } = await ctx.params;
    await deleteDraft(id, author.id);
    return Response.json({ ok: true });
  });
}
