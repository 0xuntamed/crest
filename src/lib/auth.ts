import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { pool } from "./db";

export const AUTHOR_COOKIE = "crest_author";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type Author = { id: string; displayName: string };

/** Reads the current anonymous author from the cookie, if any. Safe to call from Server Components. */
export async function currentAuthor(): Promise<Author | null> {
  const token = (await cookies()).get(AUTHOR_COOKIE)?.value;
  if (!token) return null;
  const { rows } = await pool.query<{ id: string; display_name: string }>(
    "select id, display_name from authors where token_hash = $1",
    [hashToken(token)],
  );
  return rows[0] ? { id: rows[0].id, displayName: rows[0].display_name } : null;
}

/** Returns the current author, creating one (and setting the cookie) if needed. Route Handlers / Server Functions only. */
export async function ensureAuthor(): Promise<Author> {
  const existing = await currentAuthor();
  if (existing) return existing;
  const token = randomBytes(32).toString("base64url");
  const { rows } = await pool.query<{ id: string }>("insert into authors(token_hash) values ($1) returning id", [
    hashToken(token),
  ]);
  (await cookies()).set(AUTHOR_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
  return { id: rows[0].id, displayName: "" };
}

// ---------------------------------------------------------------- browser extension (bearer tokens, never cookies)

/** Creates a fresh anonymous author for the extension and returns its secret token. */
export async function createTokenAuthor(): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await pool.query("insert into authors(token_hash) values ($1)", [hashToken(token)]);
  return token;
}

/** Resolves `Authorization: Bearer <token>`. Extension routes use only this, so CORS can stay open. */
export async function bearerAuthor(req: Request): Promise<Author | null> {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const { rows } = await pool.query<{ id: string; display_name: string }>(
    "select id, display_name from authors where token_hash = $1",
    [hashToken(m[1])],
  );
  return rows[0] ? { id: rows[0].id, displayName: rows[0].display_name } : null;
}
