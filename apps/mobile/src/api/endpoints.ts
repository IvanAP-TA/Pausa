import type { CircleDetail, InviteDto, Locale, Me, Role, SessionInfo } from "@pausa/api-types";
import type { Client } from "./client";

// Response bodies the Rust side builds with `json!{}` and does not export through ts-rs yet. Kept here, minimal and
// next to the one place that uses them, until packages/api-types has them (listed in the T1b report).
export type MagicLinkSent = { ok: true; devLink?: string };
export type CircleCreated = { id: string; inviteCode: string };
export type JoinResult = { circleId: string; joined: boolean };

export type InviteExpiry = "1d" | "7d" | "30d" | "never";
export type CircleSettings = { name?: string; description?: string; cover?: string; liveWatching?: boolean };

export const COVERS = ["popcorn", "clapper", "moon", "sofa", "star", "ghost", "rocket", "heart"] as const;
export const INVITE_MAX_USES = [1, 5, 10, 25] as const;
const e = encodeURIComponent;

/** Every call the client makes, one function each, typed with the generated contract. */
export function endpoints(c: Client) {
  return {
    me: (signal?: AbortSignal) => c.json<Me>("GET", "/api/me", { signal }),

    requestMagicLink: (input: { email: string; next: string; locale: Locale; native?: boolean }) =>
      c.json<MagicLinkSent>("POST", "/api/auth/magic-link", { body: input, auth: false }),
    guest: (name: string) => c.json<{ ok: true }>("POST", "/api/auth/guest", { body: { name }, auth: false }),
    logout: () => c.none("POST", "/api/auth/logout", { auth: false }),
    nativeExchange: (code: string) => c.json<{ token: string }>("POST", "/api/auth/native/exchange", { body: { code }, auth: false }),
    nativeCode: () => c.json<{ code: string }>("POST", "/api/auth/native/code"),

    createCircle: (name: string) => c.json<CircleCreated>("POST", "/api/circles", { body: { name } }),
    joinCircle: (code: string) => c.json<JoinResult>("POST", "/api/circles/join", { body: { code } }),
    circle: (id: string, signal?: AbortSignal) => c.json<CircleDetail>("GET", `/api/circles/${e(id)}`, { signal }),
    updateCircle: (id: string, s: CircleSettings) => c.none("PATCH", `/api/circles/${e(id)}`, { body: s }),
    deleteCircle: (id: string, name: string) => c.none("DELETE", `/api/circles/${e(id)}`, { body: { name } }),
    createInvite: (id: string, input: { expiry: InviteExpiry; maxUses: number | null }) =>
      c.json<InviteDto>("POST", `/api/circles/${e(id)}/invites`, { body: input }),
    revokeInvite: (id: string, inviteId: string) => c.none("POST", `/api/circles/${e(id)}/invites/${e(inviteId)}/revoke`),
    setRole: (id: string, userId: string, role: Exclude<Role, "owner">) =>
      c.none("PUT", `/api/circles/${e(id)}/members/${e(userId)}/role`, { body: { role } }),
    removeMember: (id: string, userId: string) => c.none("DELETE", `/api/circles/${e(id)}/members/${e(userId)}`),
    leave: (id: string) => c.none("POST", `/api/circles/${e(id)}/leave`),
    transfer: (id: string, userId: string) => c.none("POST", `/api/circles/${e(id)}/transfer`, { body: { userId } }),

    sessions: (signal?: AbortSignal) => c.json<SessionInfo[]>("GET", "/api/account/sessions", { signal }),
    revokeSession: (id: string) => c.none("DELETE", `/api/account/sessions/${e(id)}`),
    exportData: async () => (await c.send("GET", "/api/account/export")).text(),
    deleteAccount: () => c.none("DELETE", "/api/account", { body: { confirm: true } }),
  };
}
export type Api = ReturnType<typeof endpoints>;
