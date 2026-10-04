import { pct } from "@/lib/core";

export function OriginBar({ typed, pasted, other, empty }: { typed: number; pasted: number; other: number; empty?: boolean }) {
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
          <div className="bg-[#7d96cc] transition-[width] duration-500" style={{ width: `${other * 100}%` }} />
        </>
      )}
    </div>
  );
}
