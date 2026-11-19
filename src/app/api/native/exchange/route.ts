import { getAuth } from "@/lib/auth";
import { redirectWithCookies } from "@/lib/native-auth";
import { safeNext } from "@/lib/native-shell";

/** Opened by the native shell itself with the token it got through pausa://: swaps it for a session in the shell, then goes to `next`. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const next = safeNext(url.searchParams.get("next"));
  if (!token) return Response.redirect(new URL("/it/sign-in", request.url), 302);

  const auth = await getAuth();
  try {
    const res = await auth.api.verifyOneTimeToken({ body: { token }, headers: request.headers, asResponse: true });
    if (!res.ok) return Response.redirect(new URL("/it/sign-in", request.url), 302);
    return redirectWithCookies(next, res, 303);
  } catch {
    return Response.redirect(new URL("/it/sign-in", request.url), 302);
  }
}
