"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s } from "@/db";
import { getSession } from "./auth";
import { getSerataByCode } from "./serata/server";

/** Records the few things the database cannot tell us by itself (a share leaves no trace otherwise). Guests count too; failures are silent. */
export async function trackEvent(name: "card_shared" | "invite_shared", serataCode: string) {
  try {
    const parsed = z.object({ name: z.enum(["card_shared", "invite_shared"]), code: z.string().min(4).max(16) }).parse({ name, code: serataCode });
    const [session, serata] = await Promise.all([getSession(), getSerataByCode(parsed.code)]);
    if (!session || !serata) return;
    const db = await getDb();
    // One of each per person per Serata: a script calling this in a loop must not inflate the metrics.
    const [already] = await db.select({ id: s.event.id }).from(s.event)
      .where(and(eq(s.event.name, parsed.name), eq(s.event.userId, session.user.id), eq(s.event.serataId, serata.id))).limit(1);
    if (!already) await db.insert(s.event).values({ name: parsed.name, userId: session.user.id, serataId: serata.id });
  } catch {
    // metrics must never get in the way of sharing
  }
}
