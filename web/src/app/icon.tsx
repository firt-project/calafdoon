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
          background: "linear-gradient(135deg, #5e1626, #8e2438)",
          borderRadius: 10,
          color: "#fdf4f0",
          fontSize: 30,
          fontWeight: 600,
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        C
      </div>
    ),
    { ...size }
  );
}
