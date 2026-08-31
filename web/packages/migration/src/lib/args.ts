export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const body = token.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[body] = next;
      i++;
    } else {
      out[body] = true;
    }
  }
  return out;
}

export function requireInputPath(args: Record<string, string | boolean>): string {
  const input = args.input;
  if (typeof input !== "string" || !input.trim()) {
    throw new Error(
      "Missing required --input=/absolute/path/to/copied-export"
    );
  }
  if (!input.startsWith("/")) {
    throw new Error("--input must be an absolute path");
  }
  return input;
}

export function parseLimit(args: Record<string, string | boolean>): number | undefined {
  if (args.limit === undefined) return undefined;
  const n = Number(args.limit);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error("--limit must be a positive number");
  }
  return Math.floor(n);
}

export function isDryRun(args: Record<string, string | boolean>): boolean {
  return args["dry-run"] === true || args.dryRun === true || args["dry-run"] === "true";
}

export function msToDate(ms: unknown): Date | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  return new Date(ms);
}
