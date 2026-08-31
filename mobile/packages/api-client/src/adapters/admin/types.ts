export type AdminAdapter = {
  stats(): Promise<unknown>;
  analytics(): Promise<unknown>;
  activity(): Promise<unknown>;
  siteMetrics(): Promise<unknown>;
  rebuildSiteMetrics(): Promise<unknown>;
  users: {
    list(opts?: Record<string, unknown>): Promise<unknown>;
    detail(id: string): Promise<unknown>;
    activity(id: string): Promise<unknown>;
    approve(id: string): Promise<unknown>;
    reject(id: string, reason?: string): Promise<unknown>;
    ban(id: string): Promise<unknown>;
    unban(id: string): Promise<unknown>;
    requestPhoto(id: string): Promise<unknown>;
    delete(id: string, dryRun?: boolean): Promise<unknown>;
    setRole(id: string, role: string): Promise<unknown>;
    advisorReviewed(id: string, reviewed: boolean): Promise<unknown>;
  };
  reports: {
    list(opts?: Record<string, unknown>): Promise<unknown>;
    resolve(id: string, body?: Record<string, unknown>): Promise<unknown>;
    dismiss(id: string, body?: Record<string, unknown>): Promise<unknown>;
  };
  payments: {
    list(opts?: Record<string, unknown>): Promise<unknown>;
    stats(): Promise<unknown>;
    quarantine(): Promise<unknown>;
  };
  evc: {
    pending(): Promise<unknown>;
    approve(id: string): Promise<unknown>;
    reject(id: string, reason?: string): Promise<unknown>;
    count(): Promise<unknown>;
  };
  announcements: {
    list(): Promise<unknown>;
    create(body: Record<string, unknown>): Promise<unknown>;
    send(id: string): Promise<unknown>;
    schedule(id: string, scheduledFor: string): Promise<unknown>;
  };
  auditLogs(opts?: Record<string, unknown>): Promise<unknown>;
  conversations: {
    list(opts?: { limit?: number }): Promise<unknown>;
    thread(id: string, opts?: { limit?: number }): Promise<unknown>;
  };
  staffInvites: {
    list(): Promise<unknown>;
    create(body: Record<string, unknown>): Promise<unknown>;
    revoke(id: string): Promise<unknown>;
    getByToken(token: string): Promise<unknown>;
    accept(token: string, body?: Record<string, unknown>): Promise<unknown>;
  };
};

export const ADMIN_TOP_METHOD_NAMES = [
  "stats",
  "analytics",
  "activity",
  "siteMetrics",
  "rebuildSiteMetrics",
  "auditLogs",
] as const;
