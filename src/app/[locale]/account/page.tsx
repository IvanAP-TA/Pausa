import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LogoutButton } from "@/components/logout-button";
import { PushToggle } from "@/components/push-toggle";
import { pushEnabled } from "@/lib/push";
import { requireUser } from "@/lib/session";
import { getMyCircles } from "@/lib/data";
import { deleteAccountAction } from "@/lib/manage-actions";
import { saveServicesAction } from "@/lib/discover-actions";
import { saveNotificationPrefsAction } from "@/lib/manage-actions";
import { NOTIFICATION_TYPES, getDisabledTypes } from "@/lib/core/settings";
import { user as userTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { countryOf } from "@/lib/discover";
import { getDb } from "@/db";
import { COUNTRIES, getUserProviders, isCountry } from "@/lib/core/streaming";
import { regionProviders, tmdbEnabled } from "@/lib/tmdb";
import { FOUNDER_AT, peopleBrought } from "@/lib/core/circles";
import { Check } from "lucide-react";
import { cookies } from "next/headers";
import { Shell } from "@/components/shell";
import { Preferences } from "@/components/preferences";
import { BackLink } from "@/components/back-link";
import { LAST_CIRCLE_COOKIE } from "@/components/circle-memory";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

// A settings row: the label and its help on the left, the control on the right.
const row = "flex min-h-11 cursor-pointer items-center justify-between gap-4 py-3";
const check = "size-5 shrink-0 accent-[var(--color-accent)]";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "account" });
  return { title: t("title"), robots: { index: false } };
}

export default async function Account({ params, searchParams }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  const { e, country: countryParam } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser();
  const [circles, t, td, tp, mineByUser, brought] = await Promise.all([
    getMyCircles(user.id), getTranslations("account"), getTranslations("services"), getTranslations("profile"),
    getDb().then((db) => getUserProviders(db, [user.id])),
    getDb().then((db) => peopleBrought(db, user.id)),
  ]);
  const myServices = mineByUser.get(user.id) ?? [];
  const prefsDb = await getDb();
  const disabled = await getDisabledTypes(prefsDb, user.id);
  const [{ digest }] = await prefsDb.select({ digest: userTable.emailDigest }).from(userTable).where(eq(userTable.id, user.id));
  const tn = await getTranslations("notifPrefs");
  // ?country= shows another region's services before saving.
  const picked = typeof countryParam === "string" && isCountry(countryParam) ? countryParam : await countryOf(user.id, locale);
  const catalogue = await regionProviders(picked, locale);
  const regionNames = new Intl.DisplayNames([locale], { type: "region" });
  const jar = await cookies();
  const lastId = jar.get(LAST_CIRCLE_COOKIE)?.value;
  const home = circles.find((c) => c.id === lastId) ?? circles[0] ?? null;
  const me = { id: user.id, name: user.name, image: user.image };

  return (
    <Shell circle={home} circles={circles} me={me}>
    <main className="grid gap-10 px-4 pb-10 pt-4">
      <header className="grid gap-2">
        <BackLink href="/me" label={tp("title")} />
        <h1 className="display">{t("title")}</h1>
        <p className="text-sm text-muted [overflow-wrap:anywhere]">{user.email}</p>
        {brought > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-ink-2">
            {t("brought", { count: brought })}
            {brought >= FOUNDER_AT && <span className="tag border-accent text-accent">{t("founder")}</span>}
          </p>
        )}
      </header>

      <Link href="/me/edit" className="well grid gap-1 p-4 transition-colors duration-150 hover:bg-paper-2">
        <span className="font-semibold">{tp("edit")}</span>
        <span className="text-sm text-muted">{tp("editHint")}</span>
      </Link>

      <section className="grid gap-3">
        <div className="grid gap-2">
          <h2 className="chapter">{t("theme")}</h2>
          <p className="text-ink-2">{t("themeHint")}</p>
        </div>
        <Preferences initialTheme={parseTheme(jar.get(THEME_COOKIE)?.value)} />
      </section>

      {pushEnabled() ? <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!} /> : (
        <p className="text-sm text-muted">{(await getTranslations("pushSettings"))("off")}</p>
      )}

      <form action={saveNotificationPrefsAction} className="grid gap-4">
        <input type="hidden" name="locale" value={locale} />
        <div className="grid gap-2">
          <h2 className="chapter">{tn("title")}</h2>
          <p className="text-ink-2">{tn("body")}</p>
        </div>
        <ul className="rows grid">
          {NOTIFICATION_TYPES.map((n) => (
            <li key={n}><label className={row}>{tn(`types.${n}`)}<input type="checkbox" name={`type_${n}`} defaultChecked={!disabled.has(n)} className={check} /></label></li>
          ))}
          <li>
            <label className={row}>
              <span>{tn("digest")}<span className="block text-sm text-muted">{tn("digestHint")}</span></span>
              <input type="checkbox" name="emailDigest" defaultChecked={digest} className={check} />
            </label>
          </li>
        </ul>
        <button className="btn w-full sm:w-fit">{tn("save")}</button>
      </form>

      <section className="grid gap-4">
        <div className="grid gap-2">
          <h2 className="chapter">{td("title")}</h2>
          <p className="text-ink-2">{td("body")}</p>
        </div>
        {!tmdbEnabled() ? (
          <p className="text-sm text-muted">{td("off")}</p>
        ) : (
          <>
            <form method="get" className="flex items-end gap-2">
              <label className="field-label min-w-0 flex-1">
                {td("country")}
                <select name="country" defaultValue={picked} className="field">
                  {COUNTRIES.map((c) => <option key={c} value={c}>{regionNames.of(c)}</option>)}
                </select>
              </label>
              <button className="btn btn-quiet shrink-0">{td("showServices")}</button>
            </form>
            <form action={saveServicesAction} className="grid gap-4">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="country" value={picked} />
              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="sr-only">{td("title")}</legend>
                {catalogue.map((p) => (
                  <label key={p.id} className="min-w-0 cursor-pointer">
                    <input type="checkbox" name="provider" value={p.id} defaultChecked={myServices.some((m) => m.id === p.id)} className="peer sr-only" />
                    <span className="flex min-h-11 items-center gap-2 border border-rule px-3 text-sm text-ink-2 transition-colors duration-150 hover:border-muted peer-checked:border-accent peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-checked:[&>svg]:opacity-100">
                      <span className="mr-auto min-w-0 truncate">{p.name}</span>
                      <Check size={16} strokeWidth={1.6} aria-hidden="true" className="shrink-0 text-accent opacity-0 transition-opacity duration-150" />
                    </span>
                  </label>
                ))}
              </fieldset>
              <button className="btn w-full sm:w-fit">{td("save")}</button>
            </form>
            <p className="text-sm text-muted">{td("credit")}</p>
          </>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="chapter">{t("dataTitle")}</h2>
        <p className="text-ink-2">{t("dataBody")}</p>
        <a href="/api/account/export" download className="btn w-full sm:w-fit">{t("export")}</a>
      </section>

      {/* Signing out and deleting sit apart, at the end of the sheet. */}
      <div className="plate pt-6">
        <LogoutButton className="btn btn-quiet w-full sm:w-fit" />
      </div>

      <section className="grid gap-3">
        <h2 className="chapter">{t("deleteTitle")}</h2>
        <p className="text-ink-2">{t("deleteBody")}</p>
        {e === "confirm" && <p role="alert" className="text-sm text-error">{t("deleteMismatch")}</p>}
        <details>
          <summary className="btn btn-quiet w-fit list-none text-error marker:content-none">{t("deleteOpen")}</summary>
          <form action={deleteAccountAction} className="mt-4 grid gap-3">
            <input type="hidden" name="locale" value={locale} />
            <label htmlFor="email" className="text-sm text-ink-2">{t("deleteConfirm", { email: user.email })}</label>
            <input id="email" name="email" type="email" required autoComplete="off" className="field" />
            <button className="btn btn-quiet w-full text-error sm:w-fit">{t("deleteGo")}</button>
          </form>
        </details>
      </section>

      <nav className="flex gap-5 text-sm" aria-label={t("legal")}>
        <Link href="/privacy" className="link inline-flex min-h-11 items-center">{t("privacy")}</Link>
        <Link href="/terms" className="link inline-flex min-h-11 items-center">{t("terms")}</Link>
      </nav>
    </main>
    </Shell>
  );
}
