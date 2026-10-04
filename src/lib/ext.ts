import "server-only";
import { bearerAuthor, type Author } from "./auth";
import { handle } from "./http";
import { HttpError } from "./repo";

// Extension routes authenticate with a bearer token only (never cookies),
// so allowing any origin cannot be abused for CSRF.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Max-Age": "86400",
};

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

function withCors(res: Response): Response {
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}

/** Runs an extension handler: CORS on every response, errors as JSON. */
export async function extHandle(fn: () => Promise<Response>) {
  return withCors(await handle(fn));
}

export async function requireBearer(req: Request): Promise<Author> {
  const author = await bearerAuthor(req);
  if (!author) throw new HttpError(401, "missing or unknown extension token");
  return author;
}
