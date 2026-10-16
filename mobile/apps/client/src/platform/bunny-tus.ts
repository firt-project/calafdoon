/**
 * Minimal resumable (TUS 1.0.0) uploader for Bunny Stream direct uploads.
 * Credentials (signature, expiry, video id) come from our API; the API key never
 * reaches the device.
 *
 * Capacitor patches window.fetch/XMLHttpRequest to route through native HTTP, which
 * mangles binary Blob bodies and PATCH requests. A hidden same-origin iframe has a
 * pristine WebView `fetch`, so uploads use that.
 */

export type TusCredentials = {
  endpoint: string;
  videoId: string;
  libraryId: string;
  expire: number;
  signature: string;
};

type FetchFn = typeof fetch;

let pristine: FetchFn | null = null;

function pristineFetch(): FetchFn {
  if (pristine) return pristine;
  try {
    if (typeof document !== "undefined" && document.body) {
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "display:none;width:0;height:0;border:0";
      document.body.appendChild(frame);
      const f = frame.contentWindow?.fetch;
      if (f) {
        pristine = f.bind(frame.contentWindow) as FetchFn;
        return pristine;
      }
    }
  } catch {
    /* fall through */
  }
  pristine = fetch.bind(globalThis) as FetchFn;
  return pristine;
}

function b64(value: string): string {
  return btoa(unescape(encodeURIComponent(value)));
}

const CHUNK = 2 * 1024 * 1024;
const MAX_RETRIES = 5;

export class UploadCancelled extends Error {
  constructor() {
    super("Upload cancelled");
    this.name = "UploadCancelled";
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new UploadCancelled());
    });
  });
}

export async function tusUpload(
  file: Blob,
  creds: TusCredentials,
  opts: {
    title: string;
    onProgress?: (sent: number, total: number) => void;
    signal?: AbortSignal;
    /** Previously created upload URL, to resume after an interruption. */
    resumeUrl?: string | null;
    onUrl?: (url: string) => void;
  }
): Promise<void> {
  const f = pristineFetch();
  const authHeaders = {
    AuthorizationSignature: creds.signature,
    AuthorizationExpire: String(creds.expire),
    VideoId: creds.videoId,
    LibraryId: creds.libraryId,
    "Tus-Resumable": "1.0.0",
  };

  const guard = () => {
    if (opts.signal?.aborted) throw new UploadCancelled();
  };

  let url = opts.resumeUrl ?? null;
  let offset = 0;

  async function create(): Promise<string> {
    const res = await f(creds.endpoint, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Upload-Length": String(file.size),
        "Upload-Metadata": `filetype ${b64(file.type || "video/mp4")},title ${b64(opts.title)}`,
      },
      signal: opts.signal,
    });
    if (res.status !== 201) throw new Error(`create failed (HTTP ${res.status})`);
    const loc = res.headers.get("Location");
    if (!loc) throw new Error("create failed (no upload URL)");
    return new URL(loc, creds.endpoint).toString();
  }

  async function currentOffset(u: string): Promise<number> {
    const res = await f(u, { method: "HEAD", headers: authHeaders, signal: opts.signal });
    if (res.status !== 200) throw new Error(`resume failed (HTTP ${res.status})`);
    return Number(res.headers.get("Upload-Offset") ?? 0);
  }

  guard();
  if (url) {
    try {
      offset = await currentOffset(url);
    } catch {
      url = null;
      offset = 0;
    }
  }
  if (!url) {
    url = await create();
    opts.onUrl?.(url);
  }

  let retries = 0;
  while (offset < file.size) {
    guard();
    const end = Math.min(offset + CHUNK, file.size);
    const chunk = file.slice(offset, end);
    try {
      const res = await f(url, {
        method: "PATCH",
        headers: {
          ...authHeaders,
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
        },
        body: chunk,
        signal: opts.signal,
      });
      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error("Upload authorization expired"), { fatal: true });
      }
      if (res.status !== 204) throw new Error(`chunk failed (HTTP ${res.status})`);
      const reported = Number(res.headers.get("Upload-Offset"));
      offset = Number.isFinite(reported) && reported > offset ? reported : end;
      retries = 0;
      opts.onProgress?.(offset, file.size);
    } catch (err) {
      if (opts.signal?.aborted) throw new UploadCancelled();
      if ((err as { fatal?: boolean }).fatal || ++retries > MAX_RETRIES) throw err;
      await sleep(Math.min(1000 * 2 ** retries, 15_000), opts.signal);
      try {
        offset = await currentOffset(url);
      } catch {
        /* keep last known offset */
      }
    }
  }
  opts.onProgress?.(file.size, file.size);
}

/** Read a video's duration in seconds, or null when the WebView cannot decode it. */
export function readVideoDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 8000);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    video.src = url;
  });
}
