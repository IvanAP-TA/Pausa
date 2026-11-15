import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/env";
import { getDb } from "@/db";
import { verifyMagicToken } from "@/modules/auth/token";
import { upsertUserByEmail } from "@/modules/auth";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/modules/auth/session";

export async function GET(req: NextRequest) {
  const e = env();
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(`${e.APP_URL}/?error=token`);

  const res = await verifyMagicToken(e.AUTH_SECRET, token, Date.now());
  if (!res.ok) return NextResponse.redirect(`${e.APP_URL}/?error=token`);

  const db = getDb(e.DB);
  const user = await upsertUserByEmail(db, res.email, res.email.split("@")[0]);
  const session = await createSession(db, user.id);

  const store = await cookies();
  store.set(SESSION_COOKIE, session.id, sessionCookieOptions(session.expiresAt));
  return NextResponse.redirect(`${e.APP_URL}/circles`);
}
