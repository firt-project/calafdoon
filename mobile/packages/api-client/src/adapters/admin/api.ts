import { apiClient } from "../api-client";
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

/** Map Convex admin filter names to Nest query params. */
function nestUserListQuery(opts?: Record<string, unknown>): string {
  if (!opts) return "";
  const params: Record<string, unknown> = {};
  if (opts.search) params.search = opts.search;
  if (opts.cursor) params.cursor = opts.cursor;
  if (opts.limit != null) params.limit = opts.limit;

  const role = opts.role;
  if (role && role !== "all") params.role = role;

  const review = opts.review ?? opts.reviewStatus;
  if (review && review !== "all") {
    params.reviewStatus = review;
  }

  const payment = opts.payment;
  if (payment === "basic" || payment === "premium") {
    params.paymentTier = payment;
  } else if (payment === "paid") {
    params.hasPaid = true;
  } else if (payment === "unpaid") {
    params.hasPaid = false;
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
    async detail(id) {
      return apiClient.get(`/admin/users/${encodeURIComponent(id)}`);
    },
    async activity(id) {
      return apiClient.get(`/admin/users/${encodeURIComponent(id)}/activity`);
    },
    async approve(id) {
      return apiClient.post(`/admin/users/${encodeURIComponent(id)}/approve`, {});
    },
    async reject(id, reason) {
      return apiClient.post(`/admin/users/${encodeURIComponent(id)}/reject`, {
        reason,
      });
    },
    async ban(id) {
      return apiClient.post(`/admin/users/${encodeURIComponent(id)}/ban`, {});
    },
    async unban(id) {
      return apiClient.post(`/admin/users/${encodeURIComponent(id)}/unban`, {});
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
