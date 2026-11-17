import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getMyCircles } from "@/lib/data";
import { deleteAccountAction, updateProfileAction } from "@/lib/manage-actions";

const input = "min-h-12 w-full rounded-sm border border-rule bg-paper-2 px-4";

export default async function Account({ params, searchParams }: PageProps<"/[locale]/account">) {
  const { locale } = await params;
  const { saved, e } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser();
  const [circles, t] = await Promise.all([getMyCircles(user.id), getTranslations("account")]);

  return (
    <main className="projector mx-auto grid max-w-md gap-8 px-4 py-10">
      <header className="grid gap-1">
        <Link href={circles[0] ? `/c/${circles[0].id}/members` : "/"} className="inline-flex min-h-8 w-fit items-center text-sm text-muted hover:text-ink">← {t("back")}</Link>
        <h1 className="font-display text-[1.75rem] leading-tight">{t("title")}</h1>
        <p className="text-sm text-muted">{user.email}</p>
      </header>

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
        <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">{t("privacy")}</Link>
        <Link href="/terms" className="underline underline-offset-4 hover:text-ink">{t("terms")}</Link>
      </nav>
    </main>
  );
}
