import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { sessions, users } from "@/db/schema";
import { newId } from "@/lib/id";
import { isMockMode } from "@/env";

export const SESSION_COOKIE = "pausa_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function createSession(db: Db, userId: string) {
  const id = newId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

export async function validateSession(db: Db, sessionId: string) {
  const row = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .get();
  if (!row) return null;
  if (row.session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }
  return row.user;
}

export async function invalidateSession(db: Db, sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: !isMockMode(),
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
