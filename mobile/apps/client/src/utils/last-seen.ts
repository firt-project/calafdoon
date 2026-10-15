/** WhatsApp-style "last seen" text, or null when the time is unknown. */
export function formatLastSeen(iso: string | null | undefined, now = new Date()): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const diffMin = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (diffMin < 1) return "Last seen just now";
  if (diffMin < 60) return `Last seen ${diffMin} min ago`;
  const time = then.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (then.getTime() >= startOfToday) return `Last seen today at ${time}`;
  if (then.getTime() >= startOfToday - dayMs) return `Last seen yesterday at ${time}`;
  const date = then.toLocaleDateString([], { day: "numeric", month: "short" });
  return `Last seen ${date}`;
}
