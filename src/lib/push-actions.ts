"use server";

import { z } from "zod";
import { getDb } from "@/db";
import { requireUser } from "./session";
import { removeSubscription, saveSubscription } from "./core/push";

const sub = z.object({
  endpoint: z.url().max(1000).startsWith("https://"),
  p256dh: z.string().min(10).max(200),
  auth: z.string().min(10).max(100),
  locale: z.string().max(5),
});

/** Called by the browser after the person said yes to notifications. Only real accounts: guests have no Cerchia to be told about. */
export async function subscribePush(input: z.input<typeof sub>) {
  const user = await requireUser();
  const data = sub.parse(input);
  await saveSubscription(await getDb(), { userId: user.id, ...data });
}

export async function unsubscribePush(endpoint: string) {
  const user = await requireUser();
  // Only your own devices: knowing someone else's endpoint must not let you switch off their notifications.
  await removeSubscription(await getDb(), z.string().max(1000).parse(endpoint), user.id);
}
