import { cookies, headers } from "next/headers";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getCircleForMember, getMembers, getMyCircles, getMyCircleSettings } from "@/lib/data";
import { getDb } from "@/db";
import { EXPIRY_CHOICES, MAX_USES_CHOICES, listInvites } from "@/lib/core/circles";
import {
  createInviteAction, leaveCircleAction, removeMemberAction, revokeInviteAction, setMemberRoleAction,
} from "@/lib/actions";
import { deleteCircleAction, renameCircleAction, saveCircleSettingsAction, saveMemberPrefsAction } from "@/lib/manage-actions";
import { COVERS, COVER_GLYPH } from "@/lib/core/settings";
import { Avatar } from "@/components/avatar";
import { TmdbAttribution } from "@/components/tmdb-attribution";
import { CopyInvite } from "./copy-invite";
import { AccountControls } from "./account-controls";

// A settings row: the label and its help on the left, the control on the right.
const row = "flex min-h-11 cursor-pointer items-center justify-between gap-4 py-3";
const check = "size-5 shrink-0 accent-[var(--color-accent)]";
const cell = "grid min-h-11 min-w-11 place-items-center border border-rule transition-colors duration-150 hover:border-muted peer-checked:border-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus";
const pageRow = "row-link grid gap-1 py-4 transition-colors duration-150 hover:bg-paper-2";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tabs" });
  return { title: t("circle"), robots: { index: false } };
}

export default async function Members({ params, searchParams }: PageProps<"/[locale]/c/[circleId]/members">) {
  const { locale, circleId } = await params;
  const { e, saved } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser();
  const now = new Date();
  const [circle, members, myCircles, invites, t, tm, format, settings, ts] = await Promise.all([
    getCircleForMember(circleId, user.id),
    getMembers(circleId),
    getMyCircles(user.id),
    getDb().then((db) => listInvites(db, circleId, now)),
    getTranslations("circle"),
    getTranslations("manage"),
    getFormatter(),
    getMyCircleSettings(circleId, user.id),
    getTranslations("settings"),
  ]);
  const isAdmin = circle!.role === "admin";
  const active = invites.filter((i) => i.state === "active");

  const h = await headers();
  const origin = process.env.BETTER_AUTH_URL ?? `https://${h.get("host")}`;
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="circleId" value={circleId} />
    </>
  );
  const error = typeof e === "string" && ["forbidden", "last_admin", "not_member", "confirm"].includes(e) ? e : null;

  return (
    <main className="grid gap-10 px-4 pb-8 pt-8">
      <header className="grid gap-3">
        <h1 className="display">{circle!.name}</h1>

        {isAdmin && (
          <details>
            <summary className="link inline-flex min-h-11 list-none items-center text-sm marker:content-none">{tm("renameCircle")}</summary>
            <form action={renameCircleAction} className="mt-2 grid gap-2 sm:flex">
              {hidden}
              <label htmlFor="circle-name" className="sr-only">{tm("renameCircle")}</label>
              <input id="circle-name" name="name" required maxLength={60} defaultValue={circle!.name} className="field sm:flex-1" />
              <button className="btn shrink-0">{tm("rename")}</button>
            </form>
          </details>
        )}

        {myCircles.length > 1 && (
          <nav aria-label={tm("switchCircle")} className="flex flex-wrap gap-2">
            {myCircles.map((c) => (
              <Link key={c.id} href={`/c/${c.id}`} aria-current={c.id === circleId ? "page" : undefined}
                className={`inline-flex min-h-11 items-center border px-3 text-sm transition-colors duration-150 ${c.id === circleId ? "border-accent font-semibold text-ink" : "border-rule text-ink-2 hover:border-muted hover:text-ink"}`}>
                {c.name}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {error && <p role="alert" className="border border-error p-3 text-sm text-error">{t(`errors.${error}`)}</p>}

      <section className="grid gap-3">
        <h2 className="chapter flex items-baseline gap-3">{t("members")} <span className="figure text-muted">{members.length}</span></h2>
        <ul className="stagger rows grid">
          {members.map((m) => (
            <li key={m.id} className="grid gap-2 py-3">
              <div className="flex min-h-11 items-center gap-3">
                <Avatar user={m} size={40} />
                <Link href={`/c/${circleId}/p/${m.id}`} className="title inline-flex min-h-11 items-center text-xl transition-colors duration-150 hover:text-accent">{m.name}</Link>
                {m.role === "admin" && <span className="tag ml-auto shrink-0">{t("admin")}</span>}
              </div>
              {isAdmin && m.id !== user.id && (
                <div className="flex flex-wrap items-start gap-2 pl-[52px]">
                  <form action={setMemberRoleAction}>
                    {hidden}
                    <input type="hidden" name="targetId" value={m.id} />
                    <input type="hidden" name="role" value={m.role === "admin" ? "member" : "admin"} />
                    <button className="btn btn-quiet btn-sm">{m.role === "admin" ? t("actions.makeMember") : t("actions.makeAdmin")}</button>
                  </form>
                  <details>
                    <summary className="btn btn-quiet btn-sm w-fit list-none text-error marker:content-none">{t("actions.remove")}</summary>
                    <form action={removeMemberAction} className="mt-2 flex items-center gap-2">
                      {hidden}
                      <input type="hidden" name="targetId" value={m.id} />
                      <button className="btn btn-quiet btn-sm whitespace-normal py-2 text-left text-error">{t("actions.confirmRemove", { name: m.name })}</button>
                    </form>
                  </details>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* The invite: the one well on this screen. */}
      <section className="well grained grid gap-5 p-5">
        <div>
          <h2 className="title">{t("invites.title")}</h2>
          <p className="mt-2 text-ink-2">{t("invites.body")}</p>
        </div>

        {active.length === 0 ? (
          <p className="text-sm text-muted">{isAdmin ? t("invites.none") : t("invites.noneMember")}</p>
        ) : (
          <ul className="rows grid">
            {active.map((inv) => (
              <li key={inv.id} className="grid gap-3 py-4">
                <p className="figure text-display tracking-[0.04em] [overflow-wrap:anywhere]">{inv.code}</p>
                <p className="tabular flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                  <span>{inv.expiresAt ? t("invites.expires", { date: format.dateTime(inv.expiresAt, { day: "numeric", month: "short" }) }) : t("invites.never")}</span>
                  <span>{inv.maxUses !== null ? t("invites.usesOf", { used: inv.uses, max: inv.maxUses }) : t("invites.uses", { used: inv.uses })}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <CopyInvite url={`${origin}/${locale}/join/${inv.code}`} />
                  {isAdmin && (
                    <form action={revokeInviteAction}>
                      {hidden}
                      <input type="hidden" name="inviteId" value={inv.id} />
                      <button className="btn btn-quiet">{t("invites.revoke")}</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {isAdmin && (
          <form action={createInviteAction} className={`grid gap-4 ${active.length === 0 ? "plate pt-5" : ""}`}>
            {hidden}
            <p className="title text-xl">{t("invites.new")}</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="field-label">
                {t("invites.expiry")}
                <select name="expiry" defaultValue="7d" className="field">
                  {(Object.keys(EXPIRY_CHOICES) as (keyof typeof EXPIRY_CHOICES)[]).map((k) => (
                    <option key={k} value={k}>{t(`invites.expiryChoices.${k}`)}</option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                {t("invites.maxUses")}
                <select name="maxUses" defaultValue="" className="field">
                  <option value="">{t("invites.unlimited")}</option>
                  {MAX_USES_CHOICES.map((n) => <option key={n} value={n}>{t("invites.people", { count: n })}</option>)}
                </select>
              </label>
            </div>
            <button className="btn w-full sm:w-fit">{t("invites.create")}</button>
          </form>
        )}
      </section>

      <section id="settings" aria-labelledby="settings-title" className="grid gap-6">
        <div className="grid gap-2">
          <h2 id="settings-title" className="chapter">{ts("title")}</h2>
          {saved && <p role="status" className="text-sm text-success">{ts("saved")}</p>}
        </div>

        <form action={saveMemberPrefsAction} className="grid gap-4">
          {hidden}
          <p className="title text-xl">{ts("mine")}</p>
          <div className="rows grid">
            <label className={row}>
              <span>{ts("mute")}<span className="block text-sm text-muted">{ts("muteHint")}</span></span>
              <input type="checkbox" name="muted" defaultChecked={settings?.muted} className={check} />
            </label>
            <label className={row}>
              <span>{ts("hideWatching")}<span className="block text-sm text-muted">{ts("hideWatchingHint")}</span></span>
              <input type="checkbox" name="hideWatching" defaultChecked={settings?.hideWatching} className={check} />
            </label>
          </div>
          <button className="btn w-full sm:w-fit">{ts("save")}</button>
        </form>

        {isAdmin && (
          <form action={saveCircleSettingsAction} className="grid gap-4">
            {hidden}
            <p className="title text-xl">{ts("group")}</p>
            <div className="rows grid">
              <label className={row}>
                <span>{ts("live")}<span className="block text-sm text-muted">{ts("liveHint")}</span></span>
                <input type="checkbox" name="liveWatching" defaultChecked={settings?.liveWatching ?? true} className={check} />
              </label>
              <label className="grid gap-2 py-4">{ts("description")}
                <textarea name="description" rows={2} maxLength={280} defaultValue={settings?.description ?? ""} className="field" />
              </label>
              <fieldset className="py-4">
                <legend className="mb-2">{ts("cover")}</legend>
                <div className="flex flex-wrap gap-2">
                  <label className="cursor-pointer"><input type="radio" name="cover" value="" defaultChecked={!settings?.cover} className="peer sr-only" />
                    <span className={`${cell} px-3 text-sm text-ink-2 peer-checked:text-ink`}>{ts("noCover")}</span></label>
                  {COVERS.map((c) => (
                    <label key={c} className="cursor-pointer"><input type="radio" name="cover" value={c} defaultChecked={settings?.cover === c} className="peer sr-only" />
                      <span className={`${cell} size-11 text-xl`}><span aria-hidden="true">{COVER_GLYPH[c]}</span><span className="sr-only">{ts(`covers.${c}`)}</span></span></label>
                  ))}
                </div>
              </fieldset>
            </div>
            <button className="btn w-full sm:w-fit">{ts("save")}</button>
          </form>
        )}
      </section>

      <div className="rows grid">
        <Link href={`/c/${circleId}/insights`} className={pageRow}>
          <span className="title text-xl">{t("insightsTitle")}</span>
          <span className="text-sm text-muted">{t("insightsBody")}</span>
        </Link>
        <Link href="/me/import" className={pageRow}>
          <span className="title text-xl">{t("importTitle")}</span>
          <span className="text-sm text-muted">{t("importBody")}</span>
        </Link>
        <Link href="/account" className={pageRow}>
          <span className="title text-xl">{tm("accountTitle")}</span>
          <span className="text-sm text-muted">{tm("accountBody")}</span>
        </Link>
      </div>

      <AccountControls initialTheme={parseTheme((await cookies()).get(THEME_COOKIE)?.value)} />

      {/* Leaving and deleting sit apart, at the end of the sheet. */}
      <div className="rows grid">
        <details className="py-3">
          <summary className="btn btn-quiet w-fit list-none text-error marker:content-none">{t("leave.title")}</summary>
          <form action={leaveCircleAction} className="mt-3 grid gap-3">
            {hidden}
            <p className="text-sm text-muted">{t("leave.body")}</p>
            <button className="btn btn-quiet w-full text-error sm:w-fit">{t("leave.confirm")}</button>
          </form>
        </details>

        {isAdmin && (
          <details className="py-3">
            <summary className="btn btn-quiet w-fit list-none text-error marker:content-none">{tm("deleteCircle")}</summary>
            <form action={deleteCircleAction} className="mt-3 grid gap-3">
              {hidden}
              <p className="text-sm text-muted">{tm("deleteCircleWarn")}</p>
              <label htmlFor="del-name" className="text-sm text-ink-2">{tm("deleteCircleConfirm", { name: circle!.name })}</label>
              <input id="del-name" name="name" required autoComplete="off" className="field" />
              <button className="btn btn-quiet w-full text-error sm:w-fit">{tm("deleteCircleGo")}</button>
            </form>
          </details>
        )}
      </div>

      <div className="grid gap-2">
        <nav className="flex gap-5 text-sm" aria-label={tm("legal")}>
          <Link href="/privacy" className="link inline-flex min-h-11 items-center">{tm("privacy")}</Link>
          <Link href="/terms" className="link inline-flex min-h-11 items-center">{tm("terms")}</Link>
        </nav>
        <TmdbAttribution />
      </div>
    </main>
  );
}
