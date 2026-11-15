import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/env";
import { getDb } from "@/db";
import { upsertUserByEmail } from "@/modules/auth";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/modules/auth/session";

// Dev-only login bypass. Active solo con MOCK_MODE=1.
export async function POST(req: NextRequest) {
  const e = env();
  if (e.MOCK_MODE !== "1") {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  const form = await req.formData();
  const name = (String(form.get("name") ?? "").trim() || "Ospite").slice(0, 40);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ospite";
  const email = `dev+${slug}@pausa.local`;

  const db = getDb(e.DB);
  const user = await upsertUserByEmail(db, email, name);
  const session = await createSession(db, user.id);

  const store = await cookies();
  store.set(SESSION_COOKIE, session.id, sessionCookieOptions(session.expiresAt));
  return NextResponse.redirect(`${e.APP_URL}/circles`, 303);
}
