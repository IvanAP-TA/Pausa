import type { AdminMetrics, AdminReports } from "@pausa/api-types";
import { client } from "@/api";
import type { Client } from "./client";

const e = encodeURIComponent;

export type ReportStatus = "open" | "resolved";
export type Resolution = "dismissed" | "removed" | "user_disabled";
/** `token` only when `native: true` was asked (the app keeps it; the web gets a cookie). */
export type ReviewSession = { circleId: string; token?: string };

/** The operator's pages (404 for everyone else) and the app-store reviewers' sign-in (404 unless the server has it configured). */
export function adminEndpoints(c: Client) {
  return {
    metrics: (signal?: AbortSignal) => c.json<AdminMetrics>("GET", "/api/admin/metrics", { signal }),
    reports: (status: ReportStatus, signal?: AbortSignal) => c.json<AdminReports>("GET", `/api/admin/reports?status=${e(status)}`, { signal }),
    resolveReport: (id: string, resolution: Resolution) => c.none("POST", `/api/admin/reports/${e(id)}/resolve`, { body: { resolution } }),
    /** 200 when the review sign-in exists on this server, 404 when it does not. */
    reviewStatus: (signal?: AbortSignal) => c.json<{ enabled: true }>("GET", "/api/review", { auth: false, signal }),
    reviewSignIn: (password: string, native: boolean) =>
      c.json<ReviewSession>("POST", "/api/review/sign-in", { body: { password, native }, auth: false }),
  };
}
export const adminApi = adminEndpoints(client);
