import { pct } from "@/lib/core";

export function OriginBar({
  typed,
  pasted,
  other,
  unaccounted = 0,
  empty,
}: {
  typed: number;
  pasted: number;
  other: number;
  /** part of `other` that nothing in the log explains (Google Docs crests) */
  unaccounted?: number;
  empty?: boolean;
}) {
  return (
    <div
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-paper-2"
      role="img"
      aria-label={empty ? "no text yet" : `typed ${pct(typed)}, pasted ${pct(pasted)}, other ${pct(other)}`}
    >
      {!empty && (
        <>
          <div className="bg-typed transition-[width] duration-500" style={{ width: `${typed * 100}%` }} />
          <div className="bg-paste transition-[width] duration-500" style={{ width: `${pasted * 100}%` }} />
          <div className="bg-other transition-[width] duration-500" style={{ width: `${Math.max(0, other - unaccounted) * 100}%` }} />
          <div className="o-u-bar transition-[width] duration-500" style={{ width: `${unaccounted * 100}%` }} />
        </>
      )}
    </div>
  );
}
