import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getMyCircles } from "@/lib/data";
import { createCircle, joinCircle } from "@/lib/actions";

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const circles = await getMyCircles(user.id);
  if (circles.length > 0) redirect(`/${locale}/c/${circles[0].id}`);

  const t = await getTranslations("home");
  return (
    <main className="projector mx-auto grid min-h-dvh max-w-md content-center gap-10 px-4 py-12">
      <header>
        <p className="font-display text-sm font-semibold text-accent">Pausa</p>
        <h1 className="mt-2 font-display text-[2rem] font-semibold leading-tight">{t("noCircleTitle")}</h1>
        <p className="mt-3 text-muted">{t("noCircleBody")}</p>
      </header>

      <form action={createCircle} className="grid gap-2">
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor="name" className="text-sm text-muted">{t("createLabel")}</label>
        <input id="name" name="name" required maxLength={60} placeholder={t("createPlaceholder")}
          className="min-h-12 rounded-sm border border-rule bg-paper-2 px-4 placeholder:text-muted/60" />
        <button className="min-h-12 rounded-full bg-accent font-semibold text-on-accent hover:bg-accent-hover">{t("createCta")}</button>
      </form>

      <form action={joinCircle} className="grid gap-2 border-t border-rule pt-8">
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor="code" className="text-sm text-muted">{t("joinLabel")}</label>
        <div className="flex gap-2">
          <input id="code" name="code" required minLength={4} maxLength={16} autoCapitalize="characters"
            className="tabular min-h-12 min-w-0 flex-1 rounded-sm border border-rule bg-paper-2 px-4 uppercase tracking-widest" />
          <button className="min-h-12 shrink-0 rounded-full border border-rule bg-paper-3 px-5 font-semibold hover:bg-rule">{t("joinCta")}</button>
        </div>
      </form>
    </main>
  );
}
