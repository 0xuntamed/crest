import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Tier } from "./core";
import { sealSvg } from "./seal";

// next/og (Satori) needs WOFF/TTF and plain colors, not CSS variables.
export const OG_SIZE = { width: 1200, height: 630 };

export const C = {
  paper: "#f4f0e8",
  paper2: "#ebe5d8",
  ink: "#17140f",
  ink2: "#4b453b",
  ink3: "#8a8274",
  rule: "#dad2c2",
  wax: "#00b1fa", // sky-450
  waxText: "#0069a8", // sky-700: sky text on light paper
  typed: "#2f6b4f",
  paste: "#00b1fa",
  other: "#fb64b6",
};

const font = (file: string) => readFile(join(process.cwd(), "assets", "fonts", file));

let fontsPromise: ReturnType<typeof loadFonts> | null = null;
async function loadFonts() {
  const [serif, serifItalic, sans, sansBold, mono] = await Promise.all([
    font("instrument-serif-latin-400-normal.woff"),
    font("instrument-serif-latin-400-italic.woff"),
    font("geist-sans-latin-400-normal.woff"),
    font("geist-sans-latin-600-normal.woff"),
    font("geist-mono-latin-500-normal.woff"),
  ]);
  return [
    { name: "Serif", data: serif, weight: 400 as const, style: "normal" as const },
    { name: "Serif", data: serifItalic, weight: 400 as const, style: "italic" as const },
    { name: "Sans", data: sans, weight: 400 as const, style: "normal" as const },
    { name: "Sans", data: sansBold, weight: 600 as const, style: "normal" as const },
    { name: "Mono", data: mono, weight: 500 as const, style: "normal" as const },
  ];
}

export function ogFonts() {
  fontsPromise ??= loadFonts().catch((err) => {
    fontsPromise = null;
    throw err;
  });
  return fontsPromise;
}

/** The generated seal as an <img>; the ringless variant avoids SVG text, which Satori can't font. */
export function SealImg({ hash, tier, size }: { hash: string; tier: Tier; size: number }) {
  const src = `data:image/svg+xml;base64,${Buffer.from(sealSvg(hash, tier, { size, ring: false })).toString("base64")}`;
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img src={src} width={size} height={size} />;
}

export function LogoMark({ size = 40 }: { size?: number }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><path d="M16 1.5l2.6 2.2 3.4-.5 1.4 3.1 3.1 1.4-.5 3.4 2.2 2.6-2.2 2.6.5 3.4-3.1 1.4-1.4 3.1-3.4-.5L16 30.5l-2.6-2.2-3.4.5-1.4-3.1-3.1-1.4.5-3.4L3.8 16 6 13.4l-.5-3.4 3.1-1.4L10 5.5l3.4.5z" fill="${C.wax}"/><path d="M20.4 11.4a6 6 0 1 0 0 9.2" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} width={size} height={size} />;
}

export function clampText(s: string, max: number) {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}
