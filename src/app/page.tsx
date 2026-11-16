import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

/** `/` → `/it|en|es`, from Accept-Language. No proxy needed (keeps Workers deploy simple). */
export default async function Root() {
  const accept = (await headers()).get("accept-language") ?? "";
  const supported = routing.locales as readonly string[];
  const locale =
    accept
      .split(",")
      .map((part) => part.trim().slice(0, 2).toLowerCase())
      .find((code) => supported.includes(code)) ?? routing.defaultLocale;
  redirect(`/${locale}`);
}
