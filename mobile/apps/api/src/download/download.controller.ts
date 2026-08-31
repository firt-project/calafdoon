import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { Public } from "../auth/auth.guards";

const APK_NAME = "hel-calafkaaga.apk";
const APP_LABEL = "HelCalaf";
const PACKAGE_ID = "com.helcalaf.app";

function resolveDownloadDir(): string {
  const candidates = [
    join(process.cwd(), "public", "download"),
    join(process.cwd(), "apps", "api", "public", "download"),
    // Compiled: dist/ → ../public/download
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

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Install ${APP_LABEL}</title>
  <style>
    :root { color-scheme: light; --brand:#a61b2b; --ink:#1a1214; --paper:#faf7f6; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100dvh; font-family: system-ui, sans-serif;
      background: radial-gradient(80% 50% at 20% 0%, #f8e9eb, transparent), var(--paper);
      color: var(--ink); display: grid; place-items: center; padding: 1.25rem;
    }
    main {
      width: min(100%, 26rem); background: #fff; border: 1px solid #e7dcde;
      border-radius: 1.35rem; padding: 1.5rem; box-shadow: 0 18px 40px rgba(28,20,22,.08);
    }
    h1 { font-size: 1.55rem; margin: 0 0 .35rem; }
    .sub { margin: 0 0 1rem; line-height: 1.45; color: #6b5c5f; }
    .btn {
      display: block; text-align: center; text-decoration: none; margin-top: .75rem;
      background: var(--brand); color: #fff; font-weight: 700; border-radius: 999px;
      padding: 1.05rem 1rem; font-size: 1.05rem;
    }
    .btn[aria-disabled="true"] { opacity: .45; pointer-events: none; }
    .steps {
      margin: 1.25rem 0 0; padding: 0; list-style: none; counter-reset: step;
    }
    .steps li {
      counter-increment: step; position: relative; padding: .65rem .75rem .65rem 2.75rem;
      margin: .4rem 0; background: #faf5f6; border-radius: .85rem; color: #4a3f42;
      line-height: 1.4; font-size: .95rem;
    }
    .steps li::before {
      content: counter(step); position: absolute; left: .65rem; top: .6rem;
      width: 1.5rem; height: 1.5rem; border-radius: 999px; background: var(--brand);
      color: #fff; font-size: .8rem; font-weight: 700; display: grid; place-items: center;
    }
    .so { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid #eee; }
    .so h2 { font-size: 1rem; margin: 0 0 .5rem; }
    .meta { font-size: .8rem; margin-top: 1rem; color: #8a7a7d; }
    code { font-size: .78rem; }
  </style>
</head>
<body>
  <main>
    <h1>Install ${APP_LABEL}</h1>
    <p class="sub">One button. Then open the file and tap Install.</p>
    <a class="btn" href="/download/${APK_NAME}" ${ready ? "" : 'aria-disabled="true"'}>
      ${ready ? `Download &amp; Install${sizeMb ? ` (${sizeMb} MB)` : ""}` : "APK not ready yet"}
    </a>
    <ol class="steps">
      <li>Tap the red button above</li>
      <li>If asked, Allow this browser / Files</li>
      <li>Open the downloaded file</li>
      <li>Tap Install → Open</li>
    </ol>
    <div class="so">
      <h2>Somali — sida loo rakibo</h2>
      <ol class="steps">
        <li>Taabo badhanka cas</li>
        <li>Haddii la weydiiyo, Allow / Oggolow</li>
        <li>Fur faylka la soo dejiyay</li>
        <li>Taabo Install → Open</li>
      </ol>
    </div>
    <p class="meta">${APP_LABEL} · Android · <code>${PACKAGE_ID}</code></p>
  </main>
</body>
</html>`);
  }

  @Public()
  @Get(APK_NAME)
  downloadApk(@Res() res: Response) {
    const apk = this.apkPath();
    if (!existsSync(apk)) {
      throw new NotFoundException(
        "APK not found. Run scripts/publish-android-apk.sh and redeploy with the APK included."
      );
    }
    const { size } = statSync(apk);
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${APK_NAME}"`
    );
    res.setHeader("Content-Length", String(size));
    res.setHeader("Cache-Control", "public, max-age=300");
    createReadStream(apk).pipe(res);
  }
}
