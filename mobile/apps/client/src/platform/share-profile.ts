import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";

const APP_SCHEME = "helcalaf";
const HTTPS_SHARE_HOST = "https://www.helcalafkaaga.com";

/** Public opaque share id — never a sequential DB id. */
export function buildProfileShareUrl(publicId: string): string {
  const id = encodeURIComponent(publicId.trim());
  if (Capacitor.isNativePlatform()) {
    return `${APP_SCHEME}://p/${id}`;
  }
  return `${HTTPS_SHARE_HOST}/p/${id}`;
}

export function isValidPublicProfileId(publicId: string): boolean {
  const id = publicId.trim();
  if (!id || id.length < 8 || id.length > 128) return false;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return false;
  if (/^\d+$/.test(id)) return false; // reject bare sequential integers
  return true;
}

export type ShareResult =
  | { ok: true; method: "native" | "web" | "clipboard" }
  | { ok: false; message: string };

export async function shareProfileLink(args: {
  publicId: string;
  title: string;
  text: string;
}): Promise<ShareResult> {
  if (!isValidPublicProfileId(args.publicId)) {
    return { ok: false, message: "This profile cannot be shared." };
  }
  const url = buildProfileShareUrl(args.publicId);

  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({
        title: args.title,
        text: args.text,
        url,
        dialogTitle: args.title,
      });
      return { ok: true, method: "native" };
    }
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: args.title, text: args.text, url });
      return { ok: true, method: "web" };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message.toLowerCase() : "";
    if (msg.includes("abort") || msg.includes("cancel")) {
      return { ok: false, message: "Share cancelled" };
    }
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return { ok: true, method: "clipboard" };
    }
  } catch {
    /* fall through */
  }

  return { ok: false, message: "Could not share or copy the link." };
}

/** Extract public id from deep-link path `/p/:id`. */
export function publicIdFromProfilePath(path: string): string | null {
  const m = path.match(/^\/p\/([^/]+)$/);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  return isValidPublicProfileId(id) ? id : null;
}
