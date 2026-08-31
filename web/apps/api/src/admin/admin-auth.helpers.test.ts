import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import {
  assertCanBanTarget,
  assertCanDeleteTarget,
  assertCanDisableTarget,
  assertCanRejectTarget,
  assertNotSelf,
  staffPrivilegeRank,
  STAFF_ACTION_FORBIDDEN,
} from "./admin-auth.helpers";

const OWNER = "owner-id";
const ADMIN_A = "admin-a";
const ADMIN_B = "admin-b";
const MEMBER = "member-id";

function assertForbidden(fn: () => void) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof ForbiddenException);
    assert.equal(
      (err as ForbiddenException).message,
      STAFF_ACTION_FORBIDDEN
    );
    return true;
  });
}

describe("staffPrivilegeRank", () => {
  it("orders owner > admin > user", () => {
    assert.equal(staffPrivilegeRank("owner"), 3);
    assert.equal(staffPrivilegeRank("admin"), 2);
    assert.equal(staffPrivilegeRank("user"), 1);
  });

  it("fails closed on unknown roles", () => {
    assert.equal(staffPrivilegeRank("moderator"), null);
    assert.equal(staffPrivilegeRank("superadmin"), null);
  });
});

describe("assertCanDisableTarget / assertCanBanTarget (H4)", () => {
  const cases: Array<{
    name: string;
    actor: { id: string; role: string };
    target: { id: string; role: string };
    allow: boolean;
  }> = [
    {
      name: "admin can ban a normal member",
      actor: { id: ADMIN_A, role: "admin" },
      target: { id: MEMBER, role: "user" },
      allow: true,
    },
    {
      name: "owner can ban a normal member",
      actor: { id: OWNER, role: "owner" },
      target: { id: MEMBER, role: "user" },
      allow: true,
    },
    {
      name: "admin cannot ban themselves",
      actor: { id: ADMIN_A, role: "admin" },
      target: { id: ADMIN_A, role: "admin" },
      allow: false,
    },
    {
      name: "owner cannot ban themselves",
      actor: { id: OWNER, role: "owner" },
      target: { id: OWNER, role: "owner" },
      allow: false,
    },
    {
      name: "admin cannot ban a peer administrator",
      actor: { id: ADMIN_A, role: "admin" },
      target: { id: ADMIN_B, role: "admin" },
      allow: false,
    },
    {
      name: "admin cannot ban the owner",
      actor: { id: ADMIN_A, role: "admin" },
      target: { id: OWNER, role: "owner" },
      allow: false,
    },
    {
      name: "owner can ban a lower-level admin",
      actor: { id: OWNER, role: "owner" },
      target: { id: ADMIN_A, role: "admin" },
      allow: true,
    },
    {
      name: "member cannot ban anyone",
      actor: { id: MEMBER, role: "user" },
      target: { id: ADMIN_A, role: "admin" },
      allow: false,
    },
    {
      name: "unknown target role fails closed",
      actor: { id: ADMIN_A, role: "admin" },
      target: { id: MEMBER, role: "moderator" },
      allow: false,
    },
    {
      name: "unknown actor role fails closed",
      actor: { id: ADMIN_A, role: "moderator" },
      target: { id: MEMBER, role: "user" },
      allow: false,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const run = () =>
        assertCanBanTarget({
          actorUserId: c.actor.id,
          actorRole: c.actor.role,
          targetUserId: c.target.id,
          targetRole: c.target.role,
        });
      if (c.allow) {
        assert.doesNotThrow(run);
        assert.doesNotThrow(() =>
          assertCanDisableTarget({
            actorUserId: c.actor.id,
            actorRole: c.actor.role,
            targetUserId: c.target.id,
            targetRole: c.target.role,
          })
        );
      } else {
        assertForbidden(run);
      }
    });
  }
});

describe("assertNotSelf / delete / reject", () => {
  it("blocks self actions", () => {
    assertForbidden(() => assertNotSelf(ADMIN_A, ADMIN_A));
  });

  it("admin cannot delete peer admin or self", () => {
    assertForbidden(() =>
      assertCanDeleteTarget(ADMIN_A, { userId: ADMIN_A, role: "admin" })
    );
    assertForbidden(() =>
      assertCanDeleteTarget(ADMIN_A, { userId: ADMIN_B, role: "admin" })
    );
    assertForbidden(() =>
      assertCanDeleteTarget(ADMIN_A, { userId: OWNER, role: "owner" })
    );
  });

  it("admin can delete a normal member", () => {
    assert.doesNotThrow(() =>
      assertCanDeleteTarget(ADMIN_A, { userId: MEMBER, role: "user" })
    );
  });

  it("cannot reject staff", () => {
    assertForbidden(() => assertCanRejectTarget("admin"));
    assertForbidden(() => assertCanRejectTarget("owner"));
    assert.doesNotThrow(() => assertCanRejectTarget("user"));
  });
});
