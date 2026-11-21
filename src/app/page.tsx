import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

/** `/` → `/it|en|es`, from Accept-Language. No proxy needed (keeps Workers deploy simple). */
export default async function Root({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const accept = (await headers()).get("accept-language") ?? "";
  const supported = routing.locales as readonly string[];
  const locale =
    accept
      .split(",")
      .map((part) => part.trim().slice(0, 2).toLowerCase())
      .find((code) => supported.includes(code)) ?? routing.defaultLocale;
  // The installed app (PWA start_url "/?app=1") opens on /home: my last Cerchia when signed in, the landing otherwise.
  redirect((await searchParams).app ? `/${locale}/home` : `/${locale}`);
}
