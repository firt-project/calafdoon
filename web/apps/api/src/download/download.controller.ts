import { Controller, Get, Header, NotFoundException, Res } from "@nestjs/common";
import type { Response } from "express";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Public } from "../auth/auth.guards";

const APK_NAME = "hel-calafkaaga.apk";
const WEBSITE_INSTALL_URL = "https://www.helcalafkaaga.com/download";

function resolveDownloadDir(): string {
  const candidates = [
    join(process.cwd(), "public", "download"),
    join(process.cwd(), "apps", "api", "public", "download"),
    join(__dirname, "..", "..", "public", "download"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, APK_NAME)) || existsSync(dir)) return dir;
  }
  return candidates[0]!;
}

@Controller("download")
export class DownloadController {
  private apkPath() {
    return join(resolveDownloadDir(), APK_NAME);
  }

  @Public()
  @Get()
  @Header("Content-Type", "text/html; charset=utf-8")
  installPage(@Res() res: Response) {
    const apk = this.apkPath();
    const ready = existsSync(apk);
    const sizeMb = ready
      ? (statSync(apk).size / (1024 * 1024)).toFixed(1)
      : null;

    res.setHeader("Cache-Control", "no-store");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="Cache-Control" content="no-store" />
  <title>Install Hel Calafkaaga</title>
  <style>
    :root { color-scheme: light; --brand:#a61b2b; --ink:#1a1214; --paper:#faf7f6; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100dvh; font-family: system-ui, sans-serif;
      background: radial-gradient(80% 50% at 20% 0%, #f8e9eb, transparent), var(--paper);
      color: var(--ink); display: grid; place-items: center; padding: 1.5rem;
    }
    main {
      width: min(100%, 26rem); background: #fff; border: 1px solid #e7dcde;
      border-radius: 1.35rem; padding: 1.5rem; box-shadow: 0 18px 40px rgba(28,20,22,.08);
    }
    h1 { font-size: 1.55rem; margin: 0 0 .5rem; }
    p { line-height: 1.5; color: #6b5c5f; }
    .btn {
      display: block; text-align: center; text-decoration: none; margin-top: 1.25rem;
      background: var(--brand); color: #fff; font-weight: 700; border-radius: 999px;
      padding: .95rem 1rem;
    }
    .btn[aria-disabled="true"] { opacity: .45; pointer-events: none; }
    ol { padding-left: 1.2rem; color: #6b5c5f; }
    li { margin: .35rem 0; }
    .meta { font-size: .85rem; margin-top: 1rem; }
    a.alt { color: var(--brand); }
  </style>
</head>
<body>
  <main>
    <h1>Install Hel Calafkaaga</h1>
    <p>Download the Android app, then open the file to install.</p>
    <a class="btn" href="/download/${APK_NAME}" ${ready ? "" : 'aria-disabled="true"'}>
      ${ready ? `Download APK${sizeMb ? ` (${sizeMb} MB)` : ""}` : "APK unavailable"}
    </a>
    <p class="meta"><strong>On your phone:</strong></p>
    <ol>
      <li>Open this page in Chrome or Samsung Internet</li>
      <li>Tap Download APK</li>
      <li>Allow install from this browser if asked</li>
      <li>Open the downloaded file and install</li>
    </ol>
    <p class="meta">Also available at <a class="alt" href="${WEBSITE_INSTALL_URL}">helcalafkaaga.com/download</a></p>
  </main>
</body>
</html>`);
  }

  @Public()
  @Get(APK_NAME)
  downloadApk(@Res() res: Response) {
    const apk = this.apkPath();
    if (!existsSync(apk)) {
      throw new NotFoundException("APK not found.");
    }
    const { size } = statSync(apk);
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${APK_NAME}"`
    );
    res.setHeader("Content-Length", String(size));
    res.setHeader("Cache-Control", "no-store");
    createReadStream(apk).pipe(res);
  }
}
