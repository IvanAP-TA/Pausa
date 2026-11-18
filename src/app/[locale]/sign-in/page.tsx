import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSession, googleEnabled } from "@/lib/auth";
import { Wordmark } from "@/components/brand";
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
    <main className="projector mx-auto grid min-h-dvh w-full max-w-[72rem] grid-rows-[auto_1fr_auto] gap-6 px-4 py-6 lg:px-8">
      <p><Wordmark size="text-3xl" /></p>
      {/* The sheet: the head on the left, the form on a well on the right; one column on a phone. */}
      <div className="grid content-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center lg:gap-16">
        <header className="min-w-0">
          <h1 className="display text-poster">{t("title")}</h1>
          <p className="mt-4 max-w-[45ch] text-lg text-ink-2">{t("lede")}</p>
        </header>
        <div className="grid min-w-0 gap-5">
          <div className="well grained p-5 sm:p-8">
            <SignInForm callbackURL={callbackURL} google={googleEnabled()} />
          </div>
          {process.env.NODE_ENV === "development" && (
            <section aria-label="Dev" className="grid gap-2">
              <p className="text-sm text-muted">Solo sviluppo: entra con un utente di prova (nessuna email)</p>
              <ul className="flex flex-wrap gap-2">
                {[["giulia", "Giulia (admin)"], ["marco", "Marco"], ["sofi", "Sofi"], ["luca", "Luca"]].map(([id, label]) => (
                  <li key={id}>
                    <a href={`/api/dev/login?email=${id}@pausa.test&next=${encodeURIComponent(callbackURL)}`} className="btn btn-quiet btn-sm max-sm:min-h-11">{label}</a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
      <div className="plate max-w-[65ch] pt-4">
        <TmdbAttribution />
      </div>
    </main>
  );
}
