import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import { getDb, type Db } from "@/db";
import { users } from "@/db/schema";
import { newId } from "@/lib/id";
import { SESSION_COOKIE, validateSession } from "./session";

export async function getCurrentUser() {
  const store = await cookies();
  const sid = store.get(SESSION_COOKIE)?.value ?? null;
  if (!sid) return null;
  const db = getDb(env().DB);
  return validateSession(db, sid);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function upsertUserByEmail(
  db: Db,
  email: string,
  name: string,
  avatarUrl?: string | null,
) {
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) return existing;
  const row = {
    id: newId(),
    email,
    name: name || email.split("@")[0],
    avatarUrl: avatarUrl ?? null,
    createdAt: new Date(),
  };
  await db.insert(users).values(row);
  return row;
}

export { SESSION_COOKIE } from "./session";
