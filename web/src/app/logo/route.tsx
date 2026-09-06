/** Square brand logo for Google Organization schema (min ~112×112). SVG preferred by Google. */
export async function GET() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="Hel Calafkaaga">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#5e1626"/>
      <stop offset="55%" stop-color="#8e2438"/>
      <stop offset="100%" stop-color="#a83049"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 210)" stroke="#fdf4f0" stroke-width="14" fill="none">
    <path d="M0 -76c20 30 14 54 -6 72" stroke="#e6b877" stroke-linecap="round"/>
    <path d="M0 -60c58 0 100 48 100 110 0 66 -45 116 -100 116S-100 116 -100 50c0 -62 42 -110 100 -110Z"/>
  </g>
  <g fill="#fdf4f0">
    <circle cx="222" cy="270" r="15"/><circle cx="290" cy="270" r="15"/><circle cx="256" cy="322" r="15"/>
  </g>
  <g fill="#e6b877">
    <circle cx="226" cy="360" r="13"/><circle cx="286" cy="360" r="13"/>
  </g>
  <text x="256" y="452" text-anchor="middle" fill="#fdf4f0" font-family="Georgia, 'Times New Roman', serif" font-size="34" font-weight="600" letter-spacing="0.3">Hel Calafkaaga</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
