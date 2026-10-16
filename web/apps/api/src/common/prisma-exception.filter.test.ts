import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { mapPrismaError } from "./prisma-exception.filter";

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "6" });

describe("mapPrismaError", () => {
  it("maps a malformed UUID to 400", () => {
    assert.deepEqual(mapPrismaError(known("P2023")), { status: 400, message: "Invalid identifier" });
  });
  it("maps missing rows to 404 and unique violations to 409", () => {
    assert.equal(mapPrismaError(known("P2025"))?.status, 404);
    assert.equal(mapPrismaError(known("P2002"))?.status, 409);
  });
  it("maps NUL bytes in text to 400", () => {
    const e = new Prisma.PrismaClientUnknownRequestError(
      'invalid byte sequence for encoding "UTF8": 0x00',
      { clientVersion: "6" }
    );
    assert.equal(mapPrismaError(e)?.status, 400);
  });
  it("leaves unknown errors alone (stay 500)", () => {
    assert.equal(mapPrismaError(known("P9999")), null);
    assert.equal(mapPrismaError(new Error("boom")), null);
  });
});
