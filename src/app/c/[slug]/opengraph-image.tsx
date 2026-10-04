import { ImageResponse } from "next/og";
import { getCrest } from "@/lib/repo";
import { TIER_INFO, formatDuration, pct } from "@/lib/core";
import { TIER_COLORS } from "@/lib/seal";
import { C, LogoMark, OG_SIZE, SealImg, clampText, ogFonts } from "@/lib/og";

export const alt = "A sealed Crest: signed, replayable proof of human writing";
export const size = OG_SIZE;
export const contentType = "image/png";

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [crest, fonts] = await Promise.all([getCrest(slug), ogFonts()]);

  if (!crest) {
    return new ImageResponse(
      (
        <div style={{ ...frame, alignItems: "center", justifyContent: "center", fontFamily: "Serif", fontSize: 72 }}>
          No record of that crest.
        </div>
      ),
      { ...size, fonts },
    );
  }

  const m = crest.metrics;
  const tierColor = TIER_COLORS[crest.tier];
  const title = clampText(crest.title || "Untitled", 90);
  const titleSize = title.length <= 24 ? 104 : title.length <= 48 ? 84 : 66;
  const byline = `${crest.author_name ? `by ${clampText(crest.author_name, 28)}` : "Written anonymously"} · sealed ${dateFmt.format(crest.sealed_at)}`;

  return new ImageResponse(
    (
      <div style={frame}>
        {/* soft wax glow behind the seal */}
        <div
          style={{
            position: "absolute",
            right: -220,
            top: -160,
            width: 760,
            height: 760,
            borderRadius: 760,
            background: `radial-gradient(circle, ${tierColor.wax}2e 0%, ${C.paper}00 70%)`,
          }}
        />
        <div style={{ position: "absolute", right: 36, top: 130, display: "flex" }}>
          <SealImg hash={crest.chain_head} tier={crest.tier} size={400} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", width: 700, height: "100%", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <LogoMark size={40} />
            <span style={{ fontFamily: "Serif", fontSize: 40, color: C.ink }}>Crest</span>
            <span style={{ fontFamily: "Mono", fontSize: 18, color: C.ink3, letterSpacing: 2, marginLeft: 18 }}>
              № {crest.slug.toUpperCase()}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "Serif", fontSize: titleSize, lineHeight: 1, letterSpacing: -2, color: C.ink }}>{title}</div>
            <div style={{ fontFamily: "Sans", fontSize: 26, color: C.ink2, marginTop: 22 }}>{byline}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  display: "flex",
                  background: tierColor.wax,
                  color: "#fff",
                  fontFamily: "Mono",
                  fontSize: 20,
                  letterSpacing: 2,
                  padding: "8px 18px",
                  borderRadius: 999,
                }}
              >
                {TIER_INFO[crest.tier].label.toUpperCase()}
              </div>
              <div style={{ fontFamily: "Mono", fontSize: 22, color: C.ink2 }}>
                {`${m.words.toLocaleString("en-US")} words · ${pct(m.typedShare, 0)} typed · ${formatDuration(m.activeMs)}`}
              </div>
            </div>
            <div style={{ display: "flex", width: 620, height: 12, borderRadius: 12, background: C.paper2, overflow: "hidden" }}>
              <div style={{ width: `${m.typedShare * 100}%`, background: C.typed }} />
              <div style={{ width: `${m.pastedShare * 100}%`, background: C.paste }} />
              <div style={{ width: `${m.otherShare * 100}%`, background: C.other }} />
            </div>
            <div style={{ fontFamily: "Mono", fontSize: 16, color: C.ink3, letterSpacing: 1 }}>
              {`SIGNED · ${crest.chain_length} BATCHES WITNESSED${crest.source === "gdocs" ? " · VIA GOOGLE DOCS" : ""} · ${crest.chain_head.slice(0, crest.source === "gdocs" ? 12 : 24)}…`}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

const frame = {
  width: "100%",
  height: "100%",
  display: "flex",
  position: "relative" as const,
  padding: "56px 64px",
  background: C.paper,
  color: C.ink,
};
