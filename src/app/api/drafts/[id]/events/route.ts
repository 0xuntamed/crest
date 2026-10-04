import type { NextRequest } from "next/server";
import { currentAuthor } from "@/lib/auth";
import { appendBatch, HttpError } from "@/lib/repo";
import { handle, readJson } from "@/lib/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/drafts/[id]/events">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const author = await currentAuthor();
    if (!author) throw new HttpError(401, "no author session");
    const body = await readJson<{ seq?: unknown; events?: unknown }>(req);
    if (!Number.isSafeInteger(body.seq)) throw new HttpError(400, "seq required");
    const out = await appendBatch(id, author.id, body.seq as number, body.events);
    return Response.json(out);
  });
}
