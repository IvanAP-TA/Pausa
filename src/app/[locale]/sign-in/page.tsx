import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSession, googleEnabled } from "@/lib/auth";
import { TmdbAttribution } from "@/components/tmdb-attribution";
import { SignInForm } from "./sign-in-form";

export default async function SignIn({ params, searchParams }: PageProps<"/[locale]/sign-in">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next } = await searchParams;
  // Only same-app relative paths are allowed as a post-login destination.
  const callbackURL = typeof next === "string" && next.startsWith(`/${locale}/`) ? next : `/${locale}`;
  // Guests (anonymous sessions) stay here: signing in upgrades them to a real account.
  const session = await getSession();
  if (session && !(session.user as { isAnonymous?: boolean | null }).isAnonymous) redirect(callbackURL);

  const t = await getTranslations("auth");
  return (
    <main className="projector mx-auto grid min-h-dvh max-w-md content-center gap-10 px-4 py-12">
      <header>
        <p className="font-display text-sm font-semibold text-accent">Pausa</p>
        <h1 className="mt-2 font-display text-[2.4rem] font-semibold leading-[1.05]">{t("title")}</h1>
        <p className="mt-4 text-muted">{t("lede")}</p>
      </header>
      <SignInForm callbackURL={callbackURL} google={googleEnabled()} />
      <TmdbAttribution />
    </main>
  );
}
