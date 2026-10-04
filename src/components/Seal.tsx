import { sealSvg } from "@/lib/seal";
import type { Tier } from "@/lib/core";

export function Seal({
  hash,
  tier,
  size = 200,
  ring = true,
  className = "",
}: {
  hash: string;
  tier: Tier;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`seal ${className}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: sealSvg(hash, tier, { size, ring }) }}
    />
  );
}
