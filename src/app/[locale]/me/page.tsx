import { Suspense } from "react";
import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookOpen, ChevronRight, Download, List, Pencil, Settings } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import { getMyCircles, getMyDiaryCounts } from "@/lib/data";
import { getProfile } from "@/lib/core/profile";
import { Avatar } from "@/components/avatar";
import { LAST_CIRCLE_COOKIE } from "@/components/circle-memory";
import { ForYou } from "@/components/for-you";
import { Poster } from "@/components/poster";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * My profile: who I am (picture, name, a few lines, the genres and titles I love), what Pausa suggests to me, and the
 * doors to everything that is only mine: my diary, my lists and watchlist, imports, settings.
 */
export default async function Profile({ params, searchParams }: PageProps<"/[locale]/me">) {
  const { locale } = await params;
  const { ok } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser();
  const [profile, counts, circles, t, tg] = await Promise.all([
    getDb().then((db) => getProfile(db, user.id)),
    getMyDiaryCounts(user.id),
    getMyCircles(user.id),
    getTranslations("profile"),
    getTranslations("profile.genres"),
  ]);
  const last = (await cookies()).get(LAST_CIRCLE_COOKIE)?.value;
  const home = circles.find((c) => c.id === last) ?? circles[0] ?? null;
  const p = profile ?? { id: user.id, name: user.name, image: user.image ?? null, bio: null, favoriteGenres: [], favorites: [] };

  const door = (href: string, Icon: typeof BookOpen, title: string, body: string) => (
    <li>
      <Link href={href} className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 py-4 transition-colors duration-150 hover:bg-paper-2">
        <Icon size={22} strokeWidth={1.6} aria-hidden="true" className="text-accent" />
        <span className="grid min-w-0 gap-0.5">
          <span className="title text-xl">{title}</span>
          <span className="text-sm text-muted">{body}</span>
        </span>
        <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" className="text-muted" />
      </Link>
    </li>
  );

  return (
    <main className="grid gap-10 px-4 pb-12 pt-6">
      {ok === "profile" && <p role="status" className="well p-3 text-sm">{t("saved")}</p>}

      <header className="grid gap-4">
        <div className="flex items-center gap-4">
          <Avatar user={p} size={88} className="text-4xl" />
          <div className="grid min-w-0 gap-1">
            <h1 className="display [overflow-wrap:anywhere]">{p.name}</h1>
            <p className="text-sm text-muted">{t("logs", { count: counts.all })}</p>
          </div>
        </div>
        {p.bio ? <p className="max-w-prose text-lg text-ink-2 [overflow-wrap:anywhere]">{p.bio}</p> : <p className="text-muted">{t("noBio")}</p>}
        {p.favoriteGenres.length > 0 && (
          <ul aria-label={t("genresTitle")} className="flex flex-wrap gap-2">
            {p.favoriteGenres.map((g) => <li key={g} className="tag">{tg(g)}</li>)}
          </ul>
        )}
        <Link href="/me/edit" className="btn w-full sm:w-fit">
          <Pencil size={18} strokeWidth={1.6} aria-hidden="true" />{t("edit")}
        </Link>
      </header>

      <section aria-labelledby="favorites" className="grid gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="favorites" className="chapter">{t("favorites")}</h2>
          {p.favorites.length > 0 && <Link href="/me/edit#favorites" className="link text-sm">{t("change")}</Link>}
        </div>
        {p.favorites.length === 0 ? (
          <Link href="/me/edit#favorites" className="empty well grained grid gap-1 p-5 transition-colors duration-150 hover:bg-paper-2">
            <span className="font-semibold">{t("favoritesEmpty")}</span>
            <span className="text-sm text-muted">{t("favoritesHint")}</span>
          </Link>
        ) : (
          <ol className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {p.favorites.map((m) => (
              <li key={m.id} className="grid min-w-0 content-start gap-1.5">
                <Poster media={m} />
                <span className="line-clamp-2 text-sm leading-tight text-ink-2 [overflow-wrap:anywhere]">{m.title}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <nav aria-label={t("mine")}>
        <ul className="rows grid border-y border-rule">
          {door("/me/diary", BookOpen, t("diary"), t("diaryBody", { count: counts.all, private: counts.private }))}
          {door("/me/lists", List, t("lists"), t("listsBody"))}
          {door("/me/import", Download, t("import"), t("importBody"))}
          {door("/account", Settings, t("settings"), t("settingsBody"))}
        </ul>
      </nav>

      <section aria-labelledby="for-you" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="for-you" className="chapter">{t("forYou")}</h2>
          <p className="text-sm text-muted">{t("forYouBody")}</p>
        </div>
        <Suspense fallback={<div className="skeleton h-40" aria-hidden="true" />}>
          <ForYou userId={user.id} locale={locale} logBase={home ? `/c/${home.id}` : null} />
        </Suspense>
      </section>
    </main>
  );
}
