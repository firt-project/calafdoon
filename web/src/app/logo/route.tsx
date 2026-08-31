/** Square brand logo for Google Organization schema (min ~112×112). SVG preferred by Google. */
export async function GET() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="Hel Calafkaaga">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6b1220"/>
      <stop offset="55%" stop-color="#a61b2b"/>
      <stop offset="100%" stop-color="#c41e3a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <text x="256" y="236" text-anchor="middle" fill="#ffffff" font-family="Georgia, 'Times New Roman', serif" font-size="72" font-weight="700" letter-spacing="-1">HC</text>
  <text x="256" y="292" text-anchor="middle" fill="#ffffff" font-family="Georgia, 'Times New Roman', serif" font-size="22" font-weight="600" letter-spacing="0.5" opacity="0.95">Hel Calafkaaga</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
