import type { NextRequest } from "next/server";
import { currentAuthor } from "@/lib/auth";
import { HttpError, sealDraft } from "@/lib/repo";
import { handle, readJson } from "@/lib/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/drafts/[id]/seal">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const author = await currentAuthor();
    if (!author) throw new HttpError(401, "no author session");
    const body = await readJson<{ title?: unknown; authorName?: unknown; isPublic?: unknown }>(req);
    const slug = await sealDraft(id, author.id, {
      title: typeof body.title === "string" ? body.title : "",
      authorName: typeof body.authorName === "string" ? body.authorName : "",
      isPublic: body.isPublic !== false,
    });
    return Response.json({ slug });
  });
}
