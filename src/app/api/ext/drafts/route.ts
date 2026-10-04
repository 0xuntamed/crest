import type { NextRequest } from "next/server";
import { createDraft, findOpenDocsDraft, HttpError, listDocsDrafts } from "@/lib/repo";
import { extHandle, preflight, requireBearer } from "@/lib/ext";
import { readJson } from "@/lib/http";

export const OPTIONS = preflight;

const DOC_ID = /^[A-Za-z0-9_-]{20,120}$/;

/** Starts recording a Google Doc, or resumes the open recording for it. */
export async function POST(req: NextRequest) {
  return extHandle(async () => {
    const author = await requireBearer(req);
    const body = await readJson<{ docId?: unknown; title?: unknown }>(req, 10_000);
    if (typeof body.docId !== "string" || !DOC_ID.test(body.docId)) throw new HttpError(400, "docId required");
    const title = typeof body.title === "string" ? body.title : "";
    const open = await findOpenDocsDraft(author.id, body.docId);
    if (open) return Response.json({ draftId: open.id, seq: open.seq, headHash: open.head_hash, resumed: true });
    const draftId = await createDraft(author.id, { source: "gdocs", sourceRef: body.docId, title });
    return Response.json({ draftId, seq: 0, resumed: false });
  });
}

/** Recent recordings and crests for this extension install. */
export async function GET(req: NextRequest) {
  return extHandle(async () => {
    const author = await requireBearer(req);
    return Response.json({ drafts: await listDocsDrafts(author.id) });
  });
}
