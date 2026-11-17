import "server-only";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getDb } from "@/db";
import { hit, type LimitName } from "./core/limits";

/** For form actions: counts the action and, when the person is over the limit, sends them to a plain "slow down" page. */
export async function enforce(name: LimitName, userId: string) {
  const { allowed } = await hit(await getDb(), name, userId);
  if (!allowed) redirect(`/${await getLocale()}/slow-down`);
}

/** For actions that return data: true when allowed. */
export async function allow(name: LimitName, userId: string) {
  return (await hit(await getDb(), name, userId)).allowed;
}
