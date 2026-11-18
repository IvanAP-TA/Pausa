import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { LAST_CIRCLE_COOKIE } from "@/components/circle-memory";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { getMyCircles } from "@/lib/data";
import { createCircle, joinCircle } from "@/lib/actions";
import { routing } from "@/i18n/routing";
import { Landing } from "@/components/landing/landing";

const OG_LOCALE: Record<string, string> = { it: "it_IT", en: "en_US", es: "es_ES" };

/** Per-language title, description and hreflang alternates for the public landing page. */
export async function generateMetadata({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.meta" });
  return {
    title: { absolute: t("title") },
    description: t("description"),
    alternates: {
      canonical: `/${locale}`,
      languages: { ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])), "x-default": `/${routing.defaultLocale}` },
    },
    openGraph: { type: "website", title: t("title"), description: t("description"), siteName: "Pausa", locale: OG_LOCALE[locale] ?? locale },
    twitter: { card: "summary_large_image", title: t("title"), description: t("description") },
  };
}

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Not signed in (or only a Serata guest): the public landing page. Signed-in people go to their Cerchia.
  const session = await getSession();
  const user = session && !(session.user as { isAnonymous?: boolean | null }).isAnonymous ? session.user : null;
  if (!user) return <Landing />;

  const circles = await getMyCircles(user.id);
  if (circles.length > 0) {
    // Land in the Cerchia you used last, if you still belong to it.
    const last = (await cookies()).get(LAST_CIRCLE_COOKIE)?.value;
    redirect(`/${locale}/c/${(circles.find((c) => c.id === last) ?? circles[0]).id}`);
  }

  const t = await getTranslations("home");
  return (
    <main className="projector mx-auto grid min-h-dvh max-w-md content-center gap-10 px-4 py-12">
      <header>
        {/* The wordmark, at a size where display capitals are legal. */}
        <p><Wordmark size="text-3xl" /></p>
        <h1 className="display mt-6">{t("noCircleTitle")}</h1>
        <p className="mt-4 text-ink-2">{t("noCircleBody")}</p>
      </header>

      <form action={createCircle} className="grid gap-3">
        <input type="hidden" name="locale" value={locale} />
        <div className="grid gap-1">
          <label htmlFor="name" className="text-sm text-ink-2">{t("createLabel")}</label>
          <input id="name" name="name" required maxLength={60} placeholder={t("createPlaceholder")} className="field" />
        </div>
        <button className="btn btn-primary w-full sm:w-fit">{t("createCta")}</button>
      </form>

      <form action={joinCircle} className="plate grid gap-1 pt-8">
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor="code" className="text-sm text-ink-2">{t("joinLabel")}</label>
        <div className="flex gap-2">
          {/* A code a person types: capitals, tabular figures, no tracking. */}
          <input id="code" name="code" required minLength={4} maxLength={16} autoCapitalize="characters"
            className="field tabular flex-1 uppercase" />
          <button className="btn shrink-0">{t("joinCta")}</button>
        </div>
      </form>
    </main>
  );
}
