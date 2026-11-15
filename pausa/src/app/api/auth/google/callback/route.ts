import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/env";
import { getDb } from "@/db";
import { exchangeGoogleCode, fetchGoogleUser } from "@/modules/auth/google";
import { upsertUserByEmail } from "@/modules/auth";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/modules/auth/session";

export async function GET(req: NextRequest) {
  const e = env();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expectedState = store.get("g_state")?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${e.APP_URL}/?error=oauth`);
  }

  const db = getDb(e.DB);
  const tokens = await exchangeGoogleCode(
    e.GOOGLE_CLIENT_ID,
    e.GOOGLE_CLIENT_SECRET,
    code,
    `${e.APP_URL}/api/auth/google/callback`,
  );
  const profile = await fetchGoogleUser(tokens.access_token);
  const user = await upsertUserByEmail(db, profile.email, profile.name, profile.picture ?? null);
  const session = await createSession(db, user.id);

  store.set(SESSION_COOKIE, session.id, sessionCookieOptions(session.expiresAt));
  store.delete("g_state");
  return NextResponse.redirect(`${e.APP_URL}/circles`);
}
