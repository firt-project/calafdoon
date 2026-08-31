import { apiClient } from "../api-client";
import { getApiBaseUrl } from "../provider";
import type { AdminAdapter } from "./types";

function q(opts?: Record<string, unknown>): string {
  if (!opts) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) {
    if (v == null || v === "") continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Map admin filter names to Nest query params. */
function nestUserListQuery(opts?: Record<string, unknown>): string {
  if (!opts) return "";
  const params: Record<string, unknown> = {};
  if (opts.search) params.search = opts.search;
  if (opts.cursor) params.cursor = opts.cursor;
  if (opts.limit != null) params.limit = opts.limit;
  if (opts.page != null) params.page = opts.page;
  if (opts.pageSize != null) params.pageSize = opts.pageSize;
  if (opts.country) params.country = opts.country;
  if (opts.dateField) params.dateField = opts.dateField;
  if (opts.dateFrom) params.dateFrom = opts.dateFrom;
  if (opts.dateTo) params.dateTo = opts.dateTo;
  if (opts.preset) params.preset = opts.preset;
  if (opts.timezone || opts.tz) params.timezone = opts.timezone || opts.tz;
  if (opts.eventType) params.eventType = opts.eventType;
  if (opts.assignedReviewerId) params.assignedReviewerId = opts.assignedReviewerId;
  if (opts.waitingMoreThanHours != null) {
    params.waitingMoreThanHours = opts.waitingMoreThanHours;
  }
  if (opts.sortBy) params.sortBy = opts.sortBy;
  if (opts.sortOrder) params.sortOrder = opts.sortOrder;

  const role = opts.role;
  if (role && role !== "all") params.role = role;

  const review = opts.review ?? opts.reviewStatus;
  if (review && review !== "all") {
    params.reviewStatus = review;
  }

  const payment = opts.payment;
  if (payment === "basic" || payment === "premium") {
    params.paymentTier = payment;
  } else if (payment === "trial") {
    params.onTrial = true;
  } else if (payment === "paid") {
    params.hasPaid = true;
  } else if (payment === "unpaid") {
    params.hasPaid = false;
  } else if (opts.hasPaid === true || opts.hasPaid === false) {
    params.hasPaid = opts.hasPaid;
  } else if (opts.paymentTier === "basic" || opts.paymentTier === "premium") {
    params.paymentTier = opts.paymentTier;
  } else if (opts.onTrial === true) {
    params.onTrial = true;
  }

  const gender = opts.gender;
  if (gender === "male" || gender === "female") {
    params.gender = gender;
  }

  return q(params);
}

export const apiAdmin: AdminAdapter = {
  async stats() {
    return apiClient.get("/admin/stats");
  },
  async analytics() {
    return apiClient.get("/admin/analytics");
  },
  async activity() {
    return apiClient.get("/admin/activity");
  },
  async siteMetrics() {
    return apiClient.get("/admin/site-metrics");
  },
  async statusPeriodReport(opts) {
    return apiClient.get(`/admin/reports/status-period${q(opts)}`);
  },
  async rebuildSiteMetrics() {
    return apiClient.post("/admin/site-metrics/rebuild", {});
  },
  users: {
    async list(opts) {
      const queryOpts = { ...(opts ?? {}) };
      const signal =
        queryOpts.signal instanceof AbortSignal
          ? queryOpts.signal
          : undefined;
      delete queryOpts.signal;
      return apiClient.get(`/admin/users${nestUserListQuery(queryOpts)}`, {
        signal,
      });
    },
    async lookupEmail(email) {
      return apiClient.get(
        `/admin/users/lookup-email${q({ email })}`
      );
    },
    async exportEmails(body) {
      return apiClient.post("/admin/users/emails", body) as Promise<{
        emails: string[];
        count: number;
        skipped: number;
        fixed: number;
      }>;
    },
    async purgeTypoEmails(body) {
      return apiClient.post("/admin/users/purge-typo-emails", body);
    },
    async releaseOrphan(userId) {
      return apiClient.post("/admin/users/release-orphan", { userId });
    },
    async detail(id) {
      return apiClient.get(`/admin/users/${encodeURIComponent(id)}`);
    },
    async activity(id) {
      return apiClient.get(`/admin/users/${encodeURIComponent(id)}/activity`);
    },
    async approve(id, body) {
      return apiClient.post(
        `/admin/users/${encodeURIComponent(id)}/approve`,
        body ?? {}
      );
    },
    async reject(id, reasonOrBody) {
      const body =
        typeof reasonOrBody === "string"
          ? { reason: reasonOrBody }
          : reasonOrBody ?? {};
      return apiClient.post(
        `/admin/users/${encodeURIComponent(id)}/reject`,
        body
      );
    },
    async requestChanges(id, body) {
      return apiClient.post(
        `/admin/users/${encodeURIComponent(id)}/request-changes`,
        body ?? {}
      );
    },
    async assignReviewer(id, body) {
      return apiClient.post(
        `/admin/users/${encodeURIComponent(id)}/assign-reviewer`,
        body ?? {}
      );
    },
    async bulkApprove(body) {
      return apiClient.post(`/admin/users/bulk/approve`, body ?? {});
    },
    async bulkReject(body) {
      return apiClient.post(`/admin/users/bulk/reject`, body ?? {});
    },
    async ban(id) {
      return apiClient.post(`/admin/users/${encodeURIComponent(id)}/ban`, {});
    },
    async unban(id) {
      return apiClient.post(`/admin/users/${encodeURIComponent(id)}/unban`, {});
    },
    async pause(id, reason) {
      return apiClient.post(`/admin/users/${encodeURIComponent(id)}/pause`, {
        reason,
      });
    },
    async resume(id, reason) {
      return apiClient.post(`/admin/users/${encodeURIComponent(id)}/resume`, {
        reason,
      });
    },
    async statusHistory(id, limit) {
      return apiClient.get(
        `/admin/users/${encodeURIComponent(id)}/status-history${
          limit ? `?limit=${limit}` : ""
        }`
      );
    },
    async requestPhoto(id) {
      return apiClient.post(
        `/admin/users/${encodeURIComponent(id)}/request-photo`,
        {}
      );
    },
    async delete(id, dryRun) {
      return apiClient.delete(
        `/admin/users/${encodeURIComponent(id)}${dryRun ? "?dryRun=true" : ""}`
      );
    },
    async setRole(id, role) {
      return apiClient.patch(`/admin/users/${encodeURIComponent(id)}/role`, {
        role,
      });
    },
    async advisorReviewed(id, reviewed) {
      return apiClient.patch(
        `/admin/users/${encodeURIComponent(id)}/advisor-reviewed`,
        { reviewed }
      );
    },
    async resetMfa(id) {
      return apiClient.post<{ ok: boolean }>(
        `/admin/users/${encodeURIComponent(id)}/reset-mfa`,
        {}
      );
    },
  },
  reports: {
    async list(opts) {
      return apiClient.get(`/admin/reports${q(opts)}`);
    },
    async resolve(id, body) {
      return apiClient.post(
        `/admin/reports/${encodeURIComponent(id)}/resolve`,
        body ?? {}
      );
    },
    async dismiss(id, body) {
      return apiClient.post(
        `/admin/reports/${encodeURIComponent(id)}/dismiss`,
        body ?? {}
      );
    },
  },
  payments: {
    async list(opts) {
      return apiClient.get(`/admin/payments${q(opts)}`);
    },
    async dashboard(opts) {
      return apiClient.get(`/admin/payments/dashboard${q(opts)}`);
    },
    async activity(opts) {
      return apiClient.get(`/admin/payments/activity${q(opts)}`);
    },
    async evcProofs(opts) {
      return apiClient.get(`/admin/payments/evc-proofs${q(opts)}`);
    },
    async detail(id) {
      return apiClient.get(`/admin/payments/${encodeURIComponent(id)}`);
    },
    async revenueChart(opts) {
      return apiClient.get(`/admin/payments/revenue-chart${q(opts)}`);
    },
    async exportCsv(opts) {
      const url = `${getApiBaseUrl()}/admin/payments/export${q(opts)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        let message = "Export failed";
        try {
          const body = (await res.json()) as { message?: string };
          if (body.message) message = body.message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      return res.text();
    },
    async waafiLookup(query) {
      return apiClient.get(
        `/admin/payments/waafi-lookup${q({ q: query })}`
      );
    },
    async memberships(opts) {
      return apiClient.get(`/admin/payments/memberships${q(opts)}`);
    },
    async stats() {
      return apiClient.get("/admin/payments/stats");
    },
    async quarantine() {
      return apiClient.get("/admin/payments/quarantine-summary");
    },
  },
  evc: {
    async pending() {
      return apiClient.get("/admin/evc/pending");
    },
    async approve(id) {
      return apiClient.post(`/admin/evc/${encodeURIComponent(id)}/approve`, {});
    },
    async reject(id, reason) {
      return apiClient.post(`/admin/evc/${encodeURIComponent(id)}/reject`, {
        reason,
      });
    },
    async count() {
      return apiClient.get("/admin/evc/count");
    },
  },
  announcements: {
    async list() {
      return apiClient.get("/admin/announcements");
    },
    async create(body) {
      return apiClient.post("/admin/announcements", body);
    },
    async send(id) {
      return apiClient.post(
        `/admin/announcements/${encodeURIComponent(id)}/send`,
        {}
      );
    },
    async schedule(id, scheduledFor) {
      return apiClient.post(
        `/admin/announcements/${encodeURIComponent(id)}/schedule`,
        { scheduledFor }
      );
    },
  },
  async auditLogs(opts) {
    return apiClient.get(`/admin/audit-logs${q(opts)}`);
  },
  conversations: {
    async list(opts) {
      return apiClient.get(
        `/admin/conversations${q(opts as Record<string, unknown>)}`
      );
    },
    async thread(id, opts) {
      return apiClient.get(
        `/admin/conversations/${encodeURIComponent(id)}${q(opts as Record<string, unknown>)}`
      );
    },
  },
  staffInvites: {
    async list() {
      return apiClient.get("/admin/staff-invites");
    },
    async create(body) {
      return apiClient.post("/admin/staff-invites", body);
    },
    async revoke(id) {
      return apiClient.post(
        `/admin/staff-invites/${encodeURIComponent(id)}/revoke`,
        {}
      );
    },
    async resend(id) {
      return apiClient.post(
        `/admin/staff-invites/${encodeURIComponent(id)}/resend`,
        {}
      );
    },
    async getByToken(token) {
      return apiClient.get(`/staff-invites/${encodeURIComponent(token)}`);
    },
    async accept(token, body) {
      return apiClient.post(
        `/staff-invites/${encodeURIComponent(token)}/accept`,
        body ?? {}
      );
    },
  },
};
