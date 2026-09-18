import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

export const alt = `${BRAND.name} — ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 96px",
          background: "#1f4d45",
          color: "#faf9f7",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 88,
            height: 88,
            borderRadius: 24,
            background: "#faf9f7",
            color: "#1f4d45",
            fontSize: 40,
            fontWeight: 700,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {BRAND.shortName.slice(0, 2)}
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 600, marginTop: 40 }}>
          {BRAND.name}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 34,
            marginTop: 24,
            maxWidth: 900,
            color: "#dce8e5",
          }}
        >
          {BRAND.tagline}
        </div>
      </div>
    ),
    { ...size }
  );
}
