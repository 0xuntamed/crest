// Deterministic wax-seal artwork derived from a hex hash. Same hash -> same seal, everywhere.
import type { Tier } from "./core";

export const TIER_COLORS: Record<Tier, { wax: string; deep: string; hi: string }> = {
  handwritten: { wax: "#C8371E", deep: "#7E1C0C", hi: "#F07A5C" },
  "human-led": { wax: "#2D4F93", deep: "#152B5C", hi: "#7097E0" },
  assisted: { wax: "#5A7438", deep: "#2E4019", hi: "#9DBA70" },
  assembled: { wax: "#5E5A52", deep: "#2F2C27", hi: "#A39D92" },
};

const TIER_WORD: Record<Tier, string> = {
  handwritten: "HANDWRITTEN",
  "human-led": "HUMAN-LED",
  assisted: "ASSISTED",
  assembled: "ASSEMBLED",
};

function bytesOf(hash: string): number[] {
  const clean = (hash || "0").padEnd(64, "0");
  const out: number[] = [];
  for (let i = 0; i < 64; i += 2) out.push(parseInt(clean.slice(i, i + 2), 16) || 0);
  return out;
}

const f = (n: number) => Number(n.toFixed(2));

export function sealSvg(hash: string, tier: Tier, opts: { size?: number; ring?: boolean } = {}): string {
  const size = opts.size ?? 200;
  const ring = opts.ring ?? true;
  const b = bytesOf(hash);
  const c = TIER_COLORS[tier];
  const id = `s${hash.slice(0, 10)}${size}`;
  const cx = 100;
  const cy = 100;

  // Wax blob: irregular scalloped outline.
  const lobes = 14 + (b[0] % 9);
  const pts: string[] = [];
  const steps = lobes * 8;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const lobe = Math.cos(a * lobes) * 2.6;
    const wobble = ((b[(i % 24) + 4] / 255) * 2.4 - 1.2) * (i % 8 === 0 ? 1 : 0.35);
    const r = 92 + lobe + wobble;
    pts.push(`${f(cx + Math.cos(a) * r)},${f(cy + Math.sin(a) * r)}`);
  }
  const blob = `M${pts.join("L")}Z`;

  // Rosette layers: rose curves r = R * |cos(k*theta)|
  const layers: string[] = [];
  const layerCount = 2 + (b[1] % 2);
  for (let L = 0; L < layerCount; L++) {
    const k = 3 + (b[2 + L] % 7);
    const R = 46 - L * 11 - (b[5 + L] % 6);
    const rot = (b[8 + L] / 255) * Math.PI;
    const d: string[] = [];
    const n = 360;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2;
      const r = R * (0.35 + 0.65 * Math.abs(Math.cos(k * t)));
      d.push(`${f(cx + Math.cos(t + rot) * r)},${f(cy + Math.sin(t + rot) * r)}`);
    }
    layers.push(
      `<path d="M${d.join("L")}Z" fill="none" stroke="${L % 2 ? c.hi : c.deep}" stroke-width="${f(1.6 - L * 0.3)}" stroke-opacity="${L % 2 ? 0.55 : 0.75}"/>`,
    );
  }

  // Dot ring.
  const dots = 12 + (b[11] % 24);
  const dotR = 56 + (b[12] % 6);
  let dotMarkup = "";
  for (let i = 0; i < dots; i++) {
    const a = (i / dots) * Math.PI * 2 + (b[13] / 255) * 0.5;
    const big = (b[14 + (i % 16)] & 3) === 0;
    dotMarkup += `<circle cx="${f(cx + Math.cos(a) * dotR)}" cy="${f(cy + Math.sin(a) * dotR)}" r="${big ? 1.9 : 1.1}" fill="${c.deep}" fill-opacity="0.7"/>`;
  }

  // Center glyph: a small diamond lattice from the hash.
  const core = 6 + (b[30] % 5);
  const coreShape = `<path d="M${cx} ${cy - core}L${cx + core} ${cy}L${cx} ${cy + core}L${cx - core} ${cy}Z" fill="${c.deep}" fill-opacity="0.8"/><circle cx="${cx}" cy="${cy}" r="${f(core / 3)}" fill="${c.hi}" fill-opacity="0.9"/>`;

  const ringText = `CREST · ${TIER_WORD[tier]} · ${hash.slice(0, 12).toUpperCase()} · `;
  const ringMarkup = ring
    ? `<path id="${id}r" d="M ${cx} ${cy} m -71 0 a 71 71 0 1 1 142 0 a 71 71 0 1 1 -142 0" fill="none"/>
       <circle cx="${cx}" cy="${cy}" r="80" fill="none" stroke="${c.deep}" stroke-opacity=".55" stroke-width="1.2"/>
       <circle cx="${cx}" cy="${cy}" r="63" fill="none" stroke="${c.deep}" stroke-opacity=".45" stroke-width="0.8"/>
       <text font-family="ui-monospace, 'Geist Mono', monospace" font-size="9.4" letter-spacing="1.6" fill="${c.deep}" fill-opacity=".85" font-weight="600">
         <textPath href="#${id}r" textLength="440" lengthAdjust="spacing">${ringText}</textPath>
       </text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="Crest seal ${hash.slice(0, 12)}">
  <defs>
    <radialGradient id="${id}g" cx="38%" cy="32%" r="75%">
      <stop offset="0" stop-color="${c.hi}"/>
      <stop offset=".45" stop-color="${c.wax}"/>
      <stop offset="1" stop-color="${c.deep}"/>
    </radialGradient>
    <radialGradient id="${id}i" cx="50%" cy="50%" r="50%">
      <stop offset=".7" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".28"/>
    </radialGradient>
  </defs>
  <path d="${blob}" fill="url(#${id}g)"/>
  <circle cx="${cx}" cy="${cy}" r="84" fill="url(#${id}i)"/>
  ${ringMarkup}
  ${layers.join("")}
  ${dotMarkup}
  ${coreShape}
</svg>`;
}
