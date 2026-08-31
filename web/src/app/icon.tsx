import { ImageResponse } from "next/og";

/** Google recommends favicons of at least 48×48. */
export const size = { width: 48, height: 48 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 10,
          color: "#ffffff",
          fontSize: 18,
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
