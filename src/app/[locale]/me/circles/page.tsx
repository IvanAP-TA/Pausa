import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getMyCircles } from "@/lib/data";
import { createCircle, joinCircle } from "@/lib/actions";
import { SubmitButton } from "@/components/submit-button";

export async function generateMetadata({ params }: PageProps<"/[locale]/me/circles">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "circles" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * My Cerchie: the ones I am in, and the two ways to be in one more: an invite (the code, or the whole link pasted) or a
 * new Cerchia of my own. Reached from the arrow of the space bar, so it is one tap away from every page.
 */
export default async function MyCircles({ params }: PageProps<"/[locale]/me/circles">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [circles, t, th, tc] = await Promise.all([getMyCircles(user.id), getTranslations("circles"), getTranslations("home"), getTranslations("common")]);

  return (
    <main className="grid gap-8 px-4 pb-12 pt-2">
      <div className="grid gap-3">
        <Link href="/me" className="link inline-flex min-h-11 w-fit items-center text-sm">{tc("back")}</Link>
        <h1 className="display">{t("title")}</h1>
        <p className="max-w-prose text-ink-2">{t("lede")}</p>
      </div>

      {circles.length === 0 ? (
        <p className="well p-4 text-ink-2">{t("none")}</p>
      ) : (
        <ul className="rows grid">
          {circles.map((c) => (
            <li key={c.id}>
              <Link href={`/c/${c.id}`} className="group flex min-h-14 items-center gap-3 py-2 transition-colors duration-150 hover:text-accent">
                <span className="title min-w-0 flex-1 text-xl [overflow-wrap:anywhere]">{c.name}</span>
                {c.role === "admin" && <span className="tag shrink-0">{t("admin")}</span>}
                <ChevronRight size={18} strokeWidth={1.6} aria-hidden="true" className="shrink-0 text-muted group-hover:text-accent" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="grid gap-3">
        <h2 className="chapter">{t("joinTitle")}</h2>
        <p className="max-w-prose text-sm text-ink-2">{t("joinBody")}</p>
        <form action={joinCircle} className="grid gap-1">
          <input type="hidden" name="locale" value={locale} />
          <label htmlFor="code" className="text-sm text-ink-2">{t("joinLabel")}</label>
          <div className="flex gap-2">
            <input id="code" name="code" required minLength={4} maxLength={300} autoCapitalize="characters" autoComplete="off" spellCheck={false}
              className="field tabular min-w-0 flex-1" />
            <SubmitButton className="btn btn-primary shrink-0" pending={t("joining")}>{th("joinCta")}</SubmitButton>
          </div>
        </form>
      </section>

      <section className="grid gap-3">
        <h2 className="chapter">{t("createTitle")}</h2>
        <p className="max-w-prose text-sm text-ink-2">{t("createBody")}</p>
        <form action={createCircle} className="grid gap-1">
          <input type="hidden" name="locale" value={locale} />
          <label htmlFor="name" className="text-sm text-ink-2">{th("createLabel")}</label>
          <div className="flex flex-wrap gap-2">
            <input id="name" name="name" required maxLength={60} placeholder={th("createPlaceholder")} className="field min-w-0 flex-1" />
            <SubmitButton className="btn shrink-0" pending={t("creating")}>{th("createCta")}</SubmitButton>
          </div>
        </form>
      </section>
    </main>
  );
}
