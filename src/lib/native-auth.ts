import "server-only";

/** Copies every Set-Cookie of a Better Auth response onto a new redirect. */
export function redirectWithCookies(location: string, from: Response, status = 302): Response {
  const headers = new Headers({ Location: location });
  for (const cookie of from.headers.getSetCookie()) headers.append("set-cookie", cookie);
  return new Response(null, { status, headers });
}
