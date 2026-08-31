import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInspect } from "../src/commands/inspect.ts";
import { runInspectAuth } from "../src/commands/inspect-auth.ts";
import { runDryRun } from "../src/commands/dry-run.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleExport = path.resolve(
  __dirname,
  "../fixtures/sample-export"
);

describe("inspect sample export", () => {
  it("lists tables and counts users", async () => {
    const { report } = await runInspect(sampleExport);
    assert.ok(report.tableDirectories.includes("users"));
    assert.equal(report.tables.users?.recordCount, 3);
    assert.equal(report.storage.exists, true);
  });
});

describe("inspect-auth sample export", () => {
  it("classifies secrets without printing them", async () => {
    const { report, markdown } = await runInspectAuth(sampleExport);
    assert.equal(report.passwordProviderCount, 3);
    assert.ok(report.classifications.missing >= 1);
    assert.ok(report.classifications.malformed >= 1);
    assert.equal(JSON.stringify(report).includes("PLACEHOLDER"), false);
    assert.equal(JSON.stringify(report).includes('"secret"'), false);
    assert.ok(markdown.includes("never printed"));
  });
});

describe("dry-run sample export", () => {
  it("reports would-import counts", async () => {
    const { report } = await runDryRun({
      inputPath: sampleExport,
      limit: 20,
    });
    assert.equal(report.wouldImport.users, 3);
    assert.ok(report.wouldImport.profiles >= 1);
  });
});
