import { getAuth } from "@/lib/auth";

/**
 * Development only: signs in as one of the seeded people without an email round trip. It asks Better Auth for a magic
 * link as usual (the dev mailer keeps it instead of sending it) and follows it. In any other environment it does not exist.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  // Only from this computer or its local network: never through a public tunnel or proxy.
  const local = /^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;
  if (!local.test(url.hostname)) return new Response("Not found", { status: 404 });
  const email = url.searchParams.get("email") ?? "";
  const next = url.searchParams.get("next") ?? "/it";
  if (!email.endsWith("@pausa.test") || !next.startsWith("/")) return new Response("Bad request", { status: 400 });

  const auth = await getAuth();
  await auth.api.signInMagicLink({ body: { email, callbackURL: next }, headers: request.headers });
  const links = (globalThis as { __pausaDevLinks?: Record<string, string> }).__pausaDevLinks;
  const link = links?.[email];
  if (!link) return new Response("No link was produced", { status: 500 });
  return Response.redirect(link, 302);
}
