import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/env";
import { buildGoogleAuthUrl } from "@/modules/auth/google";
import { newId } from "@/lib/id";

export async function GET() {
  const e = env();
  const state = newId();
  const store = await cookies();
  store.set("g_state", state, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600,
  });
  const url = buildGoogleAuthUrl(
    e.GOOGLE_CLIENT_ID,
    `${e.APP_URL}/api/auth/google/callback`,
    state,
  );
  return NextResponse.redirect(url);
}
