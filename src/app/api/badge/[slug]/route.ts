import type { NextRequest } from "next/server";
import { getCrest } from "@/lib/repo";
import { TIER_INFO } from "@/lib/core";
import { TIER_COLORS, sealSvg } from "@/lib/seal";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Embeddable badge: <img src="/api/badge/{slug}">. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/badge/[slug]">) {
  const { slug } = await ctx.params;
  const crest = await getCrest(slug.replace(/\.svg$/, ""));
  if (!crest) return new Response("not found", { status: 404 });

  const c = TIER_COLORS[crest.tier];
  const seal = sealSvg(crest.chain_head, crest.tier, { size: 40, ring: false })
    .replace("<svg ", '<svg x="6" y="6" ');
  const label = TIER_INFO[crest.tier].label;
  const words = crest.metrics.words.toLocaleString("en-US");
  const typed = `${Math.round(crest.metrics.typedShare * 100)}% typed`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="268" height="52" viewBox="0 0 268 52">
  <rect x=".5" y=".5" width="267" height="51" rx="26" fill="#F6F2EA" stroke="#D8D0C0"/>
  ${seal}
  <text x="56" y="22" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" font-weight="650" fill="#16130F">${esc(label)} · verified by Crest</text>
  <text x="56" y="38" font-family="ui-monospace, monospace" font-size="10" fill="${c.deep}">${esc(`${words} words · ${typed} · ${crest.slug.slice(0, 6)}`)}</text>
</svg>`;
  return new Response(svg, {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
}
