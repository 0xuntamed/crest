import type { NextRequest } from "next/server";
import { appendBatch, getDraft, HttpError } from "@/lib/repo";
import { extHandle, preflight, requireBearer } from "@/lib/ext";
import { readJson } from "@/lib/http";

export const OPTIONS = preflight;

export async function POST(req: NextRequest, ctx: RouteContext<"/api/ext/drafts/[id]/events">) {
  return extHandle(async () => {
    const author = await requireBearer(req);
    const { id } = await ctx.params;
    const d = await getDraft(id);
    if (!d || d.source !== "gdocs") throw new HttpError(404, "draft not found");
    const body = await readJson<{ seq?: unknown; events?: unknown }>(req);
    if (!Number.isSafeInteger(body.seq)) throw new HttpError(400, "seq required");
    return Response.json(await appendBatch(id, author.id, body.seq as number, body.events));
  });
}
