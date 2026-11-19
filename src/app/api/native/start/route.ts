import { getAuth, googleEnabled } from "@/lib/auth";
import { redirectWithCookies } from "@/lib/native-auth";
import { safeNext } from "@/lib/native-shell";

/**
 * Opened by the native shell in the SYSTEM browser (Google refuses sign-in inside a WebView). Starts the Google sign-in and,
 * when it is done, Google sends the browser to /api/native/done, which hands the session back to the shell.
 */
export async function GET(request: Request) {
  if (!googleEnabled()) return new Response("Not found", { status: 404 });
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const auth = await getAuth();
  const done = `/api/native/done?next=${encodeURIComponent(next)}`;

  // Already signed in in this browser: no need to go through Google again.
  const session = await auth.api.getSession({ headers: request.headers });
  if (session && !(session.user as { isAnonymous?: boolean | null }).isAnonymous) return Response.redirect(new URL(done, request.url), 302);

  const res = await auth.api.signInSocial({ body: { provider: "google", callbackURL: done }, headers: request.headers, asResponse: true });
  const { url } = (await res.clone().json()) as { url?: string };
  if (!url) return new Response("Could not start the sign-in", { status: 502 });
  return redirectWithCookies(url, res);
}
