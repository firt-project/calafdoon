/**
 * Escape untrusted strings before interpolating into HTML email bodies (M9).
 * Do not use on trusted template markup (&lt;p&gt;, &lt;a&gt;, &lt;br/&gt;, etc.).
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\//g, "&#x2F;");
}
