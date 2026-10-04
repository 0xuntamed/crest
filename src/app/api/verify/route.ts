import type { NextRequest } from "next/server";
import { HttpError, lookupText } from "@/lib/repo";
import { handle, readJson } from "@/lib/http";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await readJson<{ text?: unknown }>(req, 400_000);
    if (typeof body.text !== "string") throw new HttpError(400, "text required");
    return Response.json(await lookupText(body.text));
  });
}
