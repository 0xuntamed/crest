import "server-only";
import { headers } from "next/headers";

const isLocal = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(url);

/**
 * The public origin when one is configured: NEXT_PUBLIC_SITE_URL (inlined at build time),
 * else Vercel's production domain. A localhost value counts as unset.
 */
export function configuredSiteUrl(): string | undefined {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (explicit && !isLocal(explicit)) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return explicit;
}

/** The origin for links people copy and share: the configured one, else the origin of the current request. */
export async function siteUrl(): Promise<string> {
  const configured = configuredSiteUrl();
  if (configured && !isLocal(configured)) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)/.test(host) ? "http" : "https");
    return `${proto.split(",")[0].trim()}://${host}`;
  }
  return configured ?? "http://localhost:3000";
}
