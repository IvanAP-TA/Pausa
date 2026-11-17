import { getAuth } from "@/lib/auth";

/**
 * Development only: signs in as one of the seeded people without an email round trip. It asks Better Auth for a magic
 * link as usual (the dev mailer keeps it instead of sending it) and follows it. In any other environment it does not exist.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
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
