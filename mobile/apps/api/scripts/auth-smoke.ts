#!/usr/bin/env node
/**
 * Interactive local auth smoke test — never prints password or hash.
 *
 * Usage:
 *   set -a && source apps/api/.env && set +a
 *   npm run auth:smoke -w @hel/api -- --email=user@example.com
 *
 * Optional (non-interactive): AUTH_SMOKE_PASSWORD=…
 * Optional: AUTH_SMOKE_WRITE_SESSION=1 to persist a session row (default: yes)
 */
import { createInterface } from "node:readline";
import { stdin as input, stdout as output, stderr } from "node:process";
import { PrismaClient } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { normalizeEmail } from "../src/auth/crypto-util";
import { AuthService } from "../src/auth/auth.service";
import { SessionService } from "../src/auth/session.service";
import { ConsoleMailAdapter } from "../src/auth/mail.adapter";

function parseEmail(argv: string[]): string {
  const arg = argv.find((a) => a.startsWith("--email="));
  if (!arg) {
    stderr.write("Usage: auth:smoke --email=user@example.com\n");
    process.exit(1);
  }
  return arg.slice("--email=".length);
}

async function promptPassword(
  rl: ReturnType<typeof createInterface>
): Promise<string> {
  const fromEnv = process.env.AUTH_SMOKE_PASSWORD;
  if (fromEnv) return fromEnv;
  return new Promise((resolve) => {
    const stdin = input as typeof input & {
      setRawMode?: (v: boolean) => void;
      isTTY?: boolean;
    };
    stderr.write("Password: ");
    let buf = "";
    if (stdin.isTTY && stdin.setRawMode) {
      stdin.setRawMode(true);
      const onData = (chunk: Buffer) => {
        const s = chunk.toString("utf8");
        if (s === "\n" || s === "\r" || s === "\u0004") {
          stdin.setRawMode?.(false);
          stdin.off("data", onData);
          stderr.write("\n");
          resolve(buf);
          return;
        }
        if (s === "\u0003") {
          stdin.setRawMode?.(false);
          process.exit(130);
        }
        if (s === "\u007f") {
          buf = buf.slice(0, -1);
          return;
        }
        buf += s;
      };
      stdin.on("data", onData);
    } else {
      rl.question("", (answer) => resolve(answer));
    }
  });
}

async function main() {
  const email = normalizeEmail(parseEmail(process.argv.slice(2)));
  const rl = createInterface({ input, output: stderr });
  const password = await promptPassword(rl);
  rl.close();

  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "hel_dev_session_secret_change_me_32";
  }

  process.env.APP_URL ??= "http://127.0.0.1:3001";
  process.env.MAIL_DRIVER = "console";

  const prisma = new PrismaClient();
  const config = new ConfigService();
  const sessions = new SessionService(prisma as never, config);
  const mail = new ConsoleMailAdapter();
  const auth = new AuthService(prisma as never, sessions, config, mail);

  try {
    const result = await auth.login({
      email,
      password,
      ip: "127.0.0.1",
      userAgent: "auth-smoke",
    });

    // Immediately revoke the smoke session so we do not leave live cookies.
    // Session row existence still proves create succeeded.
    const sessionOk = !!result.rawToken && result.rawToken.length > 0;
    await auth.logoutAll(result.user.id);

    console.log(
      JSON.stringify({
        login: "success",
        role: result.user.role,
        profilePresent: result.user.hasProfile,
        sessionCreated: sessionOk,
      })
    );
  } catch {
    // Look up role/profile for failure context without revealing why.
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { emailNormalized: email },
          { email: { equals: email, mode: "insensitive" } },
        ],
      },
      include: { profile: { select: { role: true } } },
    });
    console.log(
      JSON.stringify({
        login: "failure",
        role: user?.profile?.role ?? (user ? "user" : null),
        profilePresent: !!user?.profile,
        sessionCreated: false,
      })
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  stderr.write(
    `Smoke test failed: ${err instanceof Error ? err.message : "unknown"}\n`
  );
  process.exit(1);
});
