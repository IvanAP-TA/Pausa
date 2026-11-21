import { googleEnabled } from "@/lib/auth";

/**
 * What the prerendered public pages cannot know at build time, because it lives in the Worker's variables and secrets:
 * whether "Continue with Google" is configured. Public, the same for everyone, cached at the edge for five minutes.
 */
export function GET() {
  return Response.json({ google: googleEnabled() }, { headers: { "cache-control": "public, max-age=300, s-maxage=300" } });
}
