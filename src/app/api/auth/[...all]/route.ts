import { getAuth } from "@/lib/auth";

/**
 * Better Auth handler, with one fix in front of it.
 *
 * Bug (reproduced): when the browser still holds a *signed but dead* session cookie (expired or revoked
 * session, or a wiped database), any endpoint that creates a session — email-link verify, guest sign-in,
 * OAuth callback — answers by clearing the session cookies instead of setting the new one. The first sign-in
 * silently fails; only the second works.
 * Fix: on those endpoints, drop *session* cookies that don't resolve to a live session. Everything else is
 * kept (e.g. the OAuth state cookie), and so is a live session (a Serata guest's anonymous session must be
 * present to be linked to the account they're creating).
 */
const CREATES_SESSION = /\/(magic-link\/verify|sign-in\/anonymous|callback\/[^/]+)$/;
const SESSION_COOKIE = /^(__Secure-)?better-auth\.(session_token|session_data|dont_remember)=/;

async function handler(request: Request) {
  const auth = await getAuth();
  const { pathname } = new URL(request.url);
  const cookie = request.headers.get("cookie") ?? "";
  const parts = cookie.split(";").map((c) => c.trim()).filter(Boolean);

  if (CREATES_SESSION.test(pathname) && parts.some((c) => SESSION_COOKIE.test(c))) {
    const live = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true } }).catch(() => null);
    if (!live) {
      const headers = new Headers(request.headers);
      const kept = parts.filter((c) => !SESSION_COOKIE.test(c)).join("; ");
      if (kept) headers.set("cookie", kept);
      else headers.delete("cookie");
      return auth.handler(new Request(request, { headers }));
    }
  }
  return auth.handler(request);
}

export { handler as GET, handler as POST };
