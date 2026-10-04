import { createTokenAuthor } from "@/lib/auth";
import { extHandle, preflight } from "@/lib/ext";

export const OPTIONS = preflight;

/** Issues an anonymous author token for a new extension install. */
export async function POST() {
  return extHandle(async () => Response.json({ token: await createTokenAuthor() }));
}
