import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AUTH_METHOD_NAMES } from "../auth/types";
import { PROFILE_METHOD_NAMES } from "../profile/types";
import { PREFERENCES_METHOD_NAMES } from "../preferences/types";
import { QUESTIONNAIRE_METHOD_NAMES } from "../questionnaire/types";
import { PHOTOS_METHOD_NAMES } from "../photos/types";
import { MATCHING_METHOD_NAMES } from "../matching/types";
import { CHAT_METHOD_NAMES } from "../chat/types";
import { NOTIFICATIONS_METHOD_NAMES } from "../notifications/types";
import { PAYMENTS_METHOD_NAMES, EVC_METHOD_NAMES } from "../payments/types";
import { SUPPORT_METHOD_NAMES } from "../support/types";
import { MODERATION_METHOD_NAMES } from "../moderation/types";
import { apiAuth } from "../auth/api";
import { apiProfile } from "../profile/api";
import { apiPreferences } from "../preferences/api";
import { apiQuestionnaire } from "../questionnaire/api";
import { apiPhotos } from "../photos/api";
import { apiMatching } from "../matching/api";
import { apiChat } from "../chat/api";
import { apiNotifications } from "../notifications/api";
import { apiPayments } from "../payments/api";
import { apiSupport } from "../support/api";
import { apiModeration } from "../moderation/api";
import { apiAdmin } from "../admin/api";
import { ADMIN_TOP_METHOD_NAMES } from "../admin/types";

function assertHasMethods(
  names: readonly string[],
  adapter: Record<string, unknown>,
  label: string
) {
  for (const name of names) {
    assert.equal(typeof adapter[name], "function", `${label} api missing ${name}`);
  }
}

describe("adapter contract", () => {
  it("auth exposes method names", () => {
    assertHasMethods(AUTH_METHOD_NAMES, apiAuth as never, "auth");
  });
  it("profile exposes method names", () => {
    assertHasMethods(PROFILE_METHOD_NAMES, apiProfile as never, "profile");
  });
  it("preferences exposes method names", () => {
    assertHasMethods(
      PREFERENCES_METHOD_NAMES,
      apiPreferences as never,
      "preferences"
    );
  });
  it("questionnaire exposes method names", () => {
    assertHasMethods(
      QUESTIONNAIRE_METHOD_NAMES,
      apiQuestionnaire as never,
      "questionnaire"
    );
  });
  it("photos exposes method names", () => {
    assertHasMethods(PHOTOS_METHOD_NAMES, apiPhotos as never, "photos");
  });
  it("matching exposes method names", () => {
    assertHasMethods(MATCHING_METHOD_NAMES, apiMatching as never, "matching");
  });
  it("chat exposes method names", () => {
    assertHasMethods(CHAT_METHOD_NAMES, apiChat as never, "chat");
  });
  it("notifications exposes method names", () => {
    assertHasMethods(
      NOTIFICATIONS_METHOD_NAMES,
      apiNotifications as never,
      "notifications"
    );
  });
  it("payments exposes method names", () => {
    assertHasMethods(PAYMENTS_METHOD_NAMES, apiPayments as never, "payments");
    for (const name of EVC_METHOD_NAMES) {
      assert.equal(typeof apiPayments.evc[name], "function");
    }
  });
  it("support exposes method names", () => {
    assertHasMethods(SUPPORT_METHOD_NAMES, apiSupport as never, "support");
    assert.equal(typeof apiSupport.admin.list, "function");
  });
  it("moderation exposes method names", () => {
    assertHasMethods(
      MODERATION_METHOD_NAMES,
      apiModeration as never,
      "moderation"
    );
  });
  it("admin exposes top-level method names", () => {
    assertHasMethods(ADMIN_TOP_METHOD_NAMES, apiAdmin as never, "admin");
    assert.equal(typeof apiAdmin.users.list, "function");
    assert.equal(typeof apiAdmin.staffInvites.accept, "function");
  });
});
