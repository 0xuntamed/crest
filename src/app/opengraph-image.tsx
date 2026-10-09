import { ImageResponse } from "next/og";
import { C, LogoMark, OG_SIZE, SealImg, ogFonts } from "@/lib/og";

export const alt = "Crest: prove a human wrote it";
export const size = OG_SIZE;
export const contentType = "image/png";

const HERO_HASH = "c8371e5f0a9d24b6e17c3f8a2d95b0e4c61f7a38d2e09b5c4a1f6e3d8b27c905";

export default async function Image() {
  const fonts = await ogFonts();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          padding: "56px 64px",
          background: C.paper,
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -200,
            top: -180,
            width: 780,
            height: 780,
            borderRadius: 780,
            background: `radial-gradient(circle, ${C.wax}2e 0%, ${C.paper}00 70%)`,
          }}
        />
        <div style={{ position: "absolute", right: 40, top: 120, display: "flex" }}>
          <SealImg hash={HERO_HASH} tier="handwritten" size={400} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 760, height: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <LogoMark size={40} />
            <span style={{ fontFamily: "Serif", fontSize: 40, color: C.ink }}>Crest</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "Mono", fontSize: 18, letterSpacing: 4, color: C.ink3 }}>PROOF OF HUMAN AUTHORSHIP</div>
            <div style={{ display: "flex", flexDirection: "column", fontFamily: "Serif", fontSize: 124, lineHeight: 0.95, letterSpacing: -3, color: C.ink, marginTop: 20 }}>
              <span>Prove a human</span>
              <span style={{ fontStyle: "italic", color: C.waxText }}>wrote it.</span>
            </div>
          </div>
          <div style={{ fontFamily: "Sans", fontSize: 26, lineHeight: 1.4, color: C.ink2, maxWidth: 680 }}>
            Every keystroke is chained and witnessed by the server. Sealed, signed, replayable. No AI detectors.
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
