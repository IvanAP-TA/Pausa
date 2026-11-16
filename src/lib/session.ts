import "server-only";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getSession } from "./auth";

/**
 * Data-access guard for every private page and action: a signed-in, non-guest account.
 * Anonymous guests (Serata only) are sent to sign-in, which upgrades them to a real account.
 */
export async function requireUser() {
  const session = await getSession();
  if (!session || (session.user as { isAnonymous?: boolean | null }).isAnonymous) {
    const locale = await getLocale();
    redirect(`/${locale}/sign-in`);
  }
  return session.user;
}
