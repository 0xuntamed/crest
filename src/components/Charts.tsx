import { RHYTHM_BUCKETS } from "@/lib/core";

const RHYTHM_LABELS = [...RHYTHM_BUCKETS.map((b) => `<${b >= 1000 ? `${b / 1000}s` : `${b}ms`}`), `${RHYTHM_BUCKETS.at(-1)! / 1000}s+`];

/** Distribution of gaps between typed keystrokes. Human typing is lumpy; replayed typing is suspiciously flat. */
export function RhythmChart({ rhythm }: { rhythm: number[] }) {
  const max = Math.max(1, ...rhythm);
  const total = rhythm.reduce((a, b) => a + b, 0);
  return (
    <figure>
      <div className="flex h-28 items-end gap-1.5" role="img" aria-label="Keystroke interval distribution">
        {rhythm.map((v, i) => (
          <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className="rounded-t-[4px] bg-ink/80 transition-colors group-hover:bg-wax"
              style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
            />
            <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[10px] text-ink-2 opacity-0 group-hover:opacity-100">
              {total ? Math.round((v / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {RHYTHM_LABELS.map((l) => (
          <span key={l} className="flex-1 text-center font-mono text-[9.5px] text-ink-3">{l}</span>
        ))}
      </div>
    </figure>
  );
}

/** Document length over active writing time. Pastes show up as cliffs; writing shows up as a climb. */
export function GrowthChart({ growth }: { growth: number[] }) {
  if (growth.length < 2) return <div className="h-28" />;
  const max = Math.max(1, ...growth);
  const w = 300;
  const h = 100;
  const pts = growth.map((v, i) => [(i / (growth.length - 1)) * w, h - (v / max) * (h - 6) - 3] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label="Document growth over writing time">
      <defs>
        <linearGradient id="gfill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--wax)" stopOpacity=".28" />
          <stop offset="1" stopColor="var(--wax)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${w},${h}L0,${h}Z`} fill="url(#gfill)" />
      <path d={line} fill="none" stroke="var(--wax)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
