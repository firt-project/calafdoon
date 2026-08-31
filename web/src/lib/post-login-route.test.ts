import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getPostLoginRoute,
  isLoginSessionConfirmed,
} from "./post-login-route";
import type { SessionUser } from "@/data/types";

describe("isLoginSessionConfirmed", () => {
  it("rejects null/undefined — login JSON success must not imply session", () => {
    assert.equal(isLoginSessionConfirmed(null), false);
    assert.equal(isLoginSessionConfirmed(undefined), false);
  });

  it("rejects empty id", () => {
    assert.equal(
      isLoginSessionConfirmed({ id: "" } as SessionUser),
      false
    );
  });

  it("accepts a user with id from cookie-backed /auth/me", () => {
    assert.equal(
      isLoginSessionConfirmed({ id: "user_1", email: "a@b.c" } as SessionUser),
      true
    );
  });
});

describe("getPostLoginRoute without session", () => {
  it("sends unauthenticated boots back to login (never dashboard)", () => {
    assert.equal(getPostLoginRoute(null), "/login");
    assert.equal(getPostLoginRoute(undefined), "/login");
  });
});
