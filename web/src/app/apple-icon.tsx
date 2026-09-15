import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6b1220, #a61b2b)",
          borderRadius: 36,
          color: "#ffffff",
          fontSize: 64,
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        HC
      </div>
    ),
    { ...size }
  );
}
