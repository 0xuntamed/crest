import type { NextRequest } from "next/server";
import { currentAuthor } from "@/lib/auth";
import { deleteDraft, HttpError, setDraftTitle } from "@/lib/repo";
import { handle, readJson } from "@/lib/http";

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/drafts/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const author = await currentAuthor();
    if (!author) throw new HttpError(401, "no author session");
    const body = await readJson<{ title?: unknown }>(req);
    if (typeof body.title !== "string") throw new HttpError(400, "title required");
    await setDraftTitle(id, author.id, body.title);
    return Response.json({ ok: true });
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/drafts/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const author = await currentAuthor();
    if (!author) throw new HttpError(401, "no author session");
    await deleteDraft(id, author.id);
    return Response.json({ ok: true });
  });
}
