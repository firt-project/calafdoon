#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  isDryRun,
  parseArgs,
  parseLimit,
  requireInputPath,
} from "./lib/args.js";

function printHelp() {
  console.log(`Hel Calafkaaga migration CLI (Phase 1–3)

Usage:
  hel-migration <command> --input=/absolute/path/to/copied-export [options]

Commands:
  inspect           Inspect export tables, counts, storage
  inspect-auth      Classify password hash formats (never prints secrets)
  inspect-storage   Phase 3: storage reference report
  dry-run           Dry-run core table conversion / reference checks
  import-core       Import users, password authAccounts, profiles, preferences
  import-domain     Phase 2: import remaining non-file domain tables
  import-files      Phase 3: migrate blobs to local MinIO / S3
  validate          Validate core tables in local Postgres (needs DATABASE_URL)
  validate-domain   Validate Phase 2 domain tables (needs DATABASE_URL)
  validate-files    Phase 3: validate migrated media objects

Options:
  --input=PATH      Absolute path to working export (with _storage for files)
  --scrubbed=PATH   Scrubbed export for table refs (defaults to --input)
  --limit=N         Limit records / objects processed
  --dry-run         Do not write to Postgres / object storage
  --out=DIR         Write JSON/Markdown reports to this directory
  --database-url=   Override DATABASE_URL

Safety:
  Never contacts Convex, Stripe, Resend, Cloudflare R2 production, or production.
`);
}

function requireScrubbedPath(
  args: Record<string, string | boolean>,
  input: string
): string {
  if (typeof args.scrubbed === "string" && args.scrubbed.trim()) {
    if (!args.scrubbed.startsWith("/")) {
      throw new Error("--scrubbed must be an absolute path");
    }
    return args.scrubbed;
  }
  return input;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    printHelp();
    process.exit(0);
  }

  const args = parseArgs(rest);
  const outDir =
    typeof args.out === "string"
      ? args.out
      : path.join(process.cwd(), "migration-reports");

  await mkdir(typeof args.out === "string" ? args.out : outDir, {
    recursive: true,
  });

  switch (command) {
    case "inspect": {
      const { runInspect } = await import("./commands/inspect.js");
      const input = requireInputPath(args);
      const { markdown, report } = await runInspect(input, outDir);
      console.log(markdown);
      console.log(`\nWrote reports under ${outDir}`);
      console.log(`Tables found: ${report.tableDirectories.length}`);
      break;
    }
    case "inspect-auth": {
      const { runInspectAuth } = await import("./commands/inspect-auth.js");
      const input = requireInputPath(args);
      const { markdown } = await runInspectAuth(input, outDir);
      console.log(markdown);
      console.log(`\nWrote reports under ${outDir}`);
      break;
    }
    case "inspect-storage": {
      const { runInspectStorage } = await import(
        "./commands/inspect-storage.js"
      );
      const input = requireInputPath(args);
      const scrubbed = requireScrubbedPath(args, input);
      const targetOut = typeof args.out === "string" ? args.out : outDir;
      const { markdown } = await runInspectStorage({
        inputPath: input,
        scrubbedPath: scrubbed,
        outDir: targetOut,
      });
      console.log(markdown);
      console.log(`\nWrote reports under ${targetOut}`);
      break;
    }
    case "dry-run": {
      const { runDryRun } = await import("./commands/dry-run.js");
      const input = requireInputPath(args);
      const limit = parseLimit(args);
      const { markdown, report } = await runDryRun({
        inputPath: input,
        limit,
        outDir,
      });
      console.log(markdown);
      console.log(`\nWrote reports under ${outDir}`);
      if (report.issueCount > 0) process.exitCode = 2;
      break;
    }
    case "import-core": {
      const { runImportCore } = await import("./import/import-core.js");
      const input = requireInputPath(args);
      const limit = parseLimit(args);
      const dry = isDryRun(args);
      const databaseUrl =
        typeof args["database-url"] === "string"
          ? args["database-url"]
          : undefined;
      const result = await runImportCore({
        inputPath: input,
        limit,
        dryRun: dry,
        databaseUrl,
      });
      console.log(JSON.stringify(result.report, null, 2));
      if (result.counts.failed.length > 0) process.exitCode = 2;
      break;
    }
    case "import-domain": {
      const { runImportDomain } = await import("./import/import-domain.js");
      const input = requireInputPath(args);
      const limit = parseLimit(args);
      const dry = isDryRun(args);
      const databaseUrl =
        typeof args["database-url"] === "string"
          ? args["database-url"]
          : undefined;
      const targetOut = typeof args.out === "string" ? args.out : outDir;
      const result = await runImportDomain({
        inputPath: input,
        limit,
        dryRun: dry,
        databaseUrl,
        outDir: targetOut,
      });
      console.log(result.markdown);
      console.log(`\nWrote reports under ${targetOut}`);
      if (result.counts.failed.length > 0) process.exitCode = 2;
      break;
    }
    case "import-files": {
      const { runImportFiles } = await import("./import/import-files.js");
      const input = requireInputPath(args);
      const scrubbed = requireScrubbedPath(args, input);
      const limit = parseLimit(args);
      const dry = isDryRun(args);
      const databaseUrl =
        typeof args["database-url"] === "string"
          ? args["database-url"]
          : undefined;
      const targetOut = typeof args.out === "string" ? args.out : outDir;
      const result = await runImportFiles({
        inputPath: input,
        scrubbedPath: scrubbed,
        limit,
        dryRun: dry,
        databaseUrl,
        outDir: targetOut,
      });
      console.log(result.markdown);
      console.log(`\nWrote reports under ${targetOut}`);
      if (result.counts.failed > 0) process.exitCode = 2;
      break;
    }
    case "validate": {
      const { runValidate } = await import("./validate/validate.js");
      const targetOut = typeof args.out === "string" ? args.out : outDir;
      await mkdir(targetOut, { recursive: true });
      const databaseUrl =
        typeof args["database-url"] === "string"
          ? args["database-url"]
          : undefined;
      const { markdown, exitCode } = await runValidate({
        databaseUrl,
        outDir: targetOut,
      });
      console.log(markdown);
      process.exit(exitCode);
      break;
    }
    case "validate-domain": {
      const { runValidateDomain } = await import(
        "./validate/validate-domain.js"
      );
      const targetOut = typeof args.out === "string" ? args.out : outDir;
      await mkdir(targetOut, { recursive: true });
      const databaseUrl =
        typeof args["database-url"] === "string"
          ? args["database-url"]
          : undefined;
      const input = typeof args.input === "string" ? args.input : undefined;
      const { markdown, exitCode } = await runValidateDomain({
        databaseUrl,
        outDir: targetOut,
        inputPath: input,
      });
      console.log(markdown);
      process.exit(exitCode);
      break;
    }
    case "validate-files": {
      const { runValidateFiles } = await import("./validate/validate-files.js");
      const targetOut = typeof args.out === "string" ? args.out : outDir;
      await mkdir(targetOut, { recursive: true });
      const input = requireInputPath(args);
      const scrubbed = requireScrubbedPath(args, input);
      const databaseUrl =
        typeof args["database-url"] === "string"
          ? args["database-url"]
          : undefined;
      const { markdown, exitCode } = await runValidateFiles({
        inputPath: input,
        scrubbedPath: scrubbed,
        databaseUrl,
        outDir: targetOut,
      });
      console.log(markdown);
      process.exit(exitCode);
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(
    "Migration command failed:",
    error instanceof Error ? error.message : "unknown error"
  );
  process.exit(1);
});
