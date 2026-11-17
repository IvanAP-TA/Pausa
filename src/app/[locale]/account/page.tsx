import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LogoutButton } from "@/components/logout-button";
import { PushToggle } from "@/components/push-toggle";
import { pushEnabled } from "@/lib/push";
import { requireUser } from "@/lib/session";
import { getMyCircles } from "@/lib/data";
import { deleteAccountAction, updateProfileAction } from "@/lib/manage-actions";
import { saveServicesAction } from "@/lib/discover-actions";
import { countryOf } from "@/lib/discover";
import { getDb } from "@/db";
import { COUNTRIES, getUserProviders, isCountry } from "@/lib/core/streaming";
import { regionProviders, tmdbEnabled } from "@/lib/tmdb";
import { FOUNDER_AT, peopleBrought } from "@/lib/core/circles";

const input = "min-h-12 w-full rounded-sm border border-rule bg-paper-2 px-4";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("title"), robots: { index: false } };
}

export default async function Account({ params, searchParams }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  const { saved, e, country: countryParam } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser();
  const [circles, t, td, mineByUser, brought] = await Promise.all([
    getMyCircles(user.id), getTranslations("account"), getTranslations("services"),
    getDb().then((db) => getUserProviders(db, [user.id])),
    getDb().then((db) => peopleBrought(db, user.id)),
  ]);
  const myServices = mineByUser.get(user.id) ?? [];
  // ?country= shows another region's services before saving.
  const picked = typeof countryParam === "string" && isCountry(countryParam) ? countryParam : await countryOf(user.id, locale);
  const catalogue = await regionProviders(picked, locale);
  const regionNames = new Intl.DisplayNames([locale], { type: "region" });

  return (
    <main className="projector mx-auto grid max-w-md gap-8 px-4 py-10">
      <header className="grid gap-1">
        <Link href={circles[0] ? `/c/${circles[0].id}/members` : "/"} className="inline-flex min-h-10 w-fit items-center text-sm text-muted hover:text-ink">← {t("back")}</Link>
        <h1 className="font-display text-[1.75rem] leading-tight">{t("title")}</h1>
        <p className="text-sm text-muted">{user.email}</p>
      </header>

      {brought > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-md bg-paper-2 p-3 text-sm">
          {t("brought", { count: brought })}
          {brought >= FOUNDER_AT && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-on-accent">{t("founder")}</span>}
        </p>
      )}

      <LogoutButton className="min-h-11 w-fit rounded-full border border-rule px-5 text-sm font-semibold hover:bg-paper-2" />

      <form action={updateProfileAction} className="grid gap-3">
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor="name" className="text-sm text-muted">{t("name")}</label>
        <input id="name" name="name" required maxLength={40} defaultValue={user.name} className={input} />
        <div className="flex items-center gap-3">
          <button className="min-h-11 rounded-full bg-accent px-5 font-semibold text-on-accent hover:bg-accent-hover">{t("save")}</button>
          {saved && <p role="status" className="text-sm text-second">{t("saved")}</p>}
        </div>
      </form>

      {circles.length > 1 && (
        <section className="grid gap-2">
          <h2 className="text-sm text-muted">{t("circles")}</h2>
          <ul className="grid">
            {circles.map((c) => (
              <li key={c.id}><Link href={`/c/${c.id}`} className="flex min-h-12 items-center justify-between border-b border-rule hover:text-accent">{c.name}<span aria-hidden="true" className="text-muted">→</span></Link></li>
            ))}
          </ul>
        </section>
      )}

      {pushEnabled() ? <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!} /> : (
        <p className="text-sm text-muted">{(await getTranslations("pushSettings"))("off")}</p>
      )}

      <section className="grid gap-3">
        <div>
          <h2 className="font-display text-lg">{td("title")}</h2>
          <p className="text-sm text-muted">{td("body")}</p>
        </div>
        {!tmdbEnabled() ? (
          <p className="text-sm text-muted">{td("off")}</p>
        ) : (
          <>
            <form method="get" className="flex items-end gap-2">
              <label className="grid min-w-0 flex-1 gap-1.5 text-sm text-muted">
                {td("country")}
                <select name="country" defaultValue={picked} className="min-h-12 rounded-sm border border-rule bg-paper-2 px-3 text-ink">
                  {COUNTRIES.map((c) => <option key={c} value={c}>{regionNames.of(c)}</option>)}
                </select>
              </label>
              <button className="min-h-12 shrink-0 rounded-full border border-rule px-4 text-sm hover:bg-paper-2">{td("showServices")}</button>
            </form>
            <form action={saveServicesAction} className="grid gap-3">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="country" value={picked} />
              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="sr-only">{td("title")}</legend>
                {catalogue.map((p) => (
                  <label key={p.id} className="cursor-pointer">
                    <input type="checkbox" name="provider" value={p.id} defaultChecked={myServices.some((m) => m.id === p.id)} className="peer sr-only" />
                    <span className="flex min-h-11 items-center gap-2 rounded-sm border border-rule px-3 text-sm text-muted transition-colors peer-checked:border-second peer-checked:bg-second peer-checked:text-on-second peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                      <span className="min-w-0 truncate">{p.name}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <button className="min-h-11 w-fit rounded-full border border-rule bg-paper-3 px-5 text-sm font-semibold hover:bg-rule">{td("save")}</button>
            </form>
            <p className="text-xs text-muted">{td("credit")}</p>
          </>
        )}
      </section>

      <section className="grid gap-3 rounded-md bg-paper-2 p-4">
        <h2 className="font-display text-lg">{t("dataTitle")}</h2>
        <p className="text-sm text-muted">{t("dataBody")}</p>
        <a href="/api/account/export" download className="inline-flex min-h-11 w-fit items-center rounded-full border border-rule bg-paper-3 px-5 text-sm font-semibold hover:bg-rule">{t("export")}</a>
      </section>

      <section className="grid gap-3 rounded-md border border-accent p-4">
        <h2 className="font-display text-lg text-accent">{t("deleteTitle")}</h2>
        <p className="text-sm text-muted">{t("deleteBody")}</p>
        {e === "confirm" && <p role="alert" className="text-sm text-accent">{t("deleteMismatch")}</p>}
        <details>
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full border border-accent px-5 text-sm font-semibold text-accent marker:content-none">{t("deleteOpen")}</summary>
          <form action={deleteAccountAction} className="mt-3 grid gap-3">
            <input type="hidden" name="locale" value={locale} />
            <label htmlFor="email" className="text-sm">{t("deleteConfirm", { email: user.email })}</label>
            <input id="email" name="email" type="email" required autoComplete="off" className={input} />
            <button className="min-h-11 w-fit rounded-full bg-accent px-5 font-semibold text-on-accent hover:bg-accent-hover">{t("deleteGo")}</button>
          </form>
        </details>
      </section>

      <nav className="flex gap-4 text-sm text-muted" aria-label={t("legal")}>
        <Link href="/privacy" className="inline-flex min-h-10 items-center underline underline-offset-4 hover:text-ink">{t("privacy")}</Link>
        <Link href="/terms" className="inline-flex min-h-10 items-center underline underline-offset-4 hover:text-ink">{t("terms")}</Link>
      </nav>
    </main>
  );
}
