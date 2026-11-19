"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { getAuth } from "@/lib/auth";
import { hit } from "@/lib/core/limits";
import { ensureReviewAccount } from "@/lib/core/review";
import { passwordMatches, reviewEmail, reviewEnabled, takeReviewLink, wantReviewLink } from "@/lib/review";

/** App-store review sign-in. Wrong password: back to the form with ?error=1. Right one: a normal session in the demo Cerchia. */
export async function reviewSignIn(formData: FormData) {
  const email = reviewEmail();
  if (!reviewEnabled() || !email) redirect("/");
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const db = await getDb();
  if (!(await hit(db, "reviewLogin", ip)).allowed) redirect("/en/review?error=slow");

  const given = String(formData.get("password") ?? "");
  if (!(await passwordMatches(given, process.env.REVIEW_PASSWORD!))) redirect("/en/review?error=1");

  const { circleId } = await ensureReviewAccount(db, email);
  const auth = await getAuth();
  wantReviewLink(email);
  await auth.api.signInMagicLink({ body: { email, callbackURL: `/en/c/${circleId}` }, headers: h });
  const link = takeReviewLink();
  if (!link) redirect("/en/review?error=1");
  redirect(link);
}
