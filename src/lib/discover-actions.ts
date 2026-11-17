"use server";

import { redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { getDb } from "@/db";
import { requireUser } from "./session";
import { getCircleForMember } from "./data";
import { isCountry, setUserProviders } from "./core/streaming";
import { regionProviders } from "./tmdb";
import { suggestedRoster } from "./discover";

const localeFrom = (v: unknown) => (typeof v === "string" && hasLocale(routing.locales, v) ? v : routing.defaultLocale);

/** Saves the country and the services a person has. Names and logos come from TMDB again, never from the form. */
export async function saveServicesAction(formData: FormData) {
  const user = await requireUser();
  const locale = localeFrom(formData.get("locale"));
  const country = z.string().parse(formData.get("country"));
  if (!isCountry(country)) throw new Error("Unknown country");
  const wanted = new Set(formData.getAll("provider").map((v) => Number(v)).filter(Number.isInteger));
  const catalogue = await regionProviders(country, locale);
  await setUserProviders(await getDb(), { userId: user.id, country, providers: catalogue.filter((p) => wanted.has(p.id)) });
  redirect(`/${locale}/account?saved=1`);
}

/** "Fill the roster for us" on the new-Serata form. */
export async function suggestRosterAction(circleId: string, locale: string) {
  const user = await requireUser();
  if (!(await getCircleForMember(circleId, user.id))) throw new Error("Not a member of this circle");
  return suggestedRoster(circleId, user.id, localeFrom(locale));
}
