import { ImageResponse } from "next/og";
import { SITE_BRAND_NAME } from "@/lib/constants";
import { HOME_OG_DESCRIPTION } from "@/lib/seo/metadata";

export const alt = SITE_BRAND_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px 80px",
          background:
            "linear-gradient(135deg, #6b1220 0%, #a61b2b 40%, #c41e3a 75%, #c9a227 100%)",
          color: "#ffffff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "#ffffff",
              color: "#a61b2b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            HC
          </div>
          <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -2 }}>
            {SITE_BRAND_NAME}
          </div>
        </div>
        <div style={{ fontSize: 36, fontWeight: 600, opacity: 0.95 }}>
          Hel Lammaanaha Noloshaada
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 26,
            lineHeight: 1.45,
            opacity: 0.9,
            maxWidth: 920,
          }}
        >
          {HOME_OG_DESCRIPTION}
        </div>
      </div>
    ),
    { ...size }
  );
}
