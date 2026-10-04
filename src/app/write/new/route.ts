import { NextResponse, type NextRequest } from "next/server";
import { ensureAuthor } from "@/lib/auth";
import { createDraft } from "@/lib/repo";

export async function GET(req: NextRequest) {
  const author = await ensureAuthor();
  const id = await createDraft(author.id);
  return NextResponse.redirect(new URL(`/write/${id}`, req.url), 303);
}
