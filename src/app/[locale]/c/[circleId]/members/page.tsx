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

const field = "min-h-11 w-full min-w-0 rounded-sm border border-rule bg-paper-2 px-2 text-sm text-ink";
const smallBtn = "min-h-9 rounded-full border border-rule px-3 text-xs text-muted hover:text-ink";

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
    <main className="grid gap-8 px-4 pb-8 pt-6">
      <h1 className="font-display text-[1.75rem] leading-tight">{circle!.name}</h1>

      {isAdmin && (
        <details className="-mt-4">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-sm text-muted marker:content-none hover:text-ink">{tm("renameCircle")}</summary>
          <form action={renameCircleAction} className="mt-2 flex gap-2">
            {hidden}
            <label htmlFor="circle-name" className="sr-only">{tm("renameCircle")}</label>
            <input id="circle-name" name="name" required maxLength={60} defaultValue={circle!.name} className={field} />
            <button className="min-h-11 shrink-0 rounded-full border border-rule px-4 text-sm font-semibold hover:bg-paper-2">{tm("rename")}</button>
          </form>
        </details>
      )}

      {myCircles.length > 1 && (
        <nav aria-label={tm("switchCircle")} className="flex flex-wrap gap-2">
          {myCircles.map((c) => (
            <Link key={c.id} href={`/c/${c.id}`} aria-current={c.id === circleId ? "page" : undefined}
              className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm ${c.id === circleId ? "border-ink font-semibold" : "border-rule text-muted hover:text-ink"}`}>
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      {error && <p role="alert" className="rounded-md border border-accent p-3 text-sm text-accent">{t(`errors.${error}`)}</p>}

      <section id="settings" aria-labelledby="settings-title" className="grid gap-4 rounded-md border border-rule bg-paper-2 p-4">
        <h2 id="settings-title" className="font-display text-lg">{ts("title")}</h2>
        {saved && <p role="status" className="text-sm text-second-text">{ts("saved")}</p>}

        <form action={saveMemberPrefsAction} className="grid gap-3">
          {hidden}
          <p className="text-sm font-semibold">{ts("mine")}</p>
          <label className="flex min-h-10 items-start gap-3 text-sm">
            <input type="checkbox" name="muted" defaultChecked={settings?.muted} className="mt-0.5 size-5 accent-[var(--color-accent)]" />
            <span>{ts("mute")}<span className="block text-xs text-muted">{ts("muteHint")}</span></span>
          </label>
          <label className="flex min-h-10 items-start gap-3 text-sm">
            <input type="checkbox" name="hideWatching" defaultChecked={settings?.hideWatching} className="mt-0.5 size-5 accent-[var(--color-accent)]" />
            <span>{ts("hideWatching")}<span className="block text-xs text-muted">{ts("hideWatchingHint")}</span></span>
          </label>
          <button className="min-h-11 w-fit rounded-full border border-rule px-5 text-sm font-semibold hover:bg-paper-3">{ts("save")}</button>
        </form>

        {isAdmin && (
          <form action={saveCircleSettingsAction} className="grid gap-3 border-t border-rule pt-4">
            {hidden}
            <p className="text-sm font-semibold">{ts("group")}</p>
            <label className="flex min-h-10 items-start gap-3 text-sm">
              <input type="checkbox" name="liveWatching" defaultChecked={settings?.liveWatching ?? true} className="mt-0.5 size-5 accent-[var(--color-accent)]" />
              <span>{ts("live")}<span className="block text-xs text-muted">{ts("liveHint")}</span></span>
            </label>
            <label className="grid gap-1.5 text-sm">{ts("description")}
              <textarea name="description" rows={2} maxLength={280} defaultValue={settings?.description ?? ""} className="rounded-sm border border-rule bg-paper p-3 text-[15px]" />
            </label>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm">{ts("cover")}</legend>
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer"><input type="radio" name="cover" value="" defaultChecked={!settings?.cover} className="peer sr-only" />
                  <span className="grid min-h-11 min-w-11 place-items-center rounded-full border border-rule px-3 text-xs text-muted peer-checked:border-accent peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-accent">{ts("noCover")}</span></label>
                {COVERS.map((c) => (
                  <label key={c} className="cursor-pointer"><input type="radio" name="cover" value={c} defaultChecked={settings?.cover === c} className="peer sr-only" />
                    <span className="grid size-11 place-items-center rounded-full border border-rule text-xl peer-checked:border-accent peer-checked:bg-paper-3 peer-focus-visible:outline-2 peer-focus-visible:outline-accent"><span aria-hidden="true">{COVER_GLYPH[c]}</span><span className="sr-only">{ts(`covers.${c}`)}</span></span></label>
                ))}
              </div>
            </fieldset>
            <button className="min-h-11 w-fit rounded-full bg-accent px-5 text-sm font-semibold text-on-accent hover:bg-accent-hover">{ts("save")}</button>
          </form>
        )}
      </section>

      <Link href={`/c/${circleId}/insights`}
        className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-rule bg-paper-2 px-4 hover:border-muted">
        <span>
          <span className="block font-display text-lg leading-tight">{t("insightsTitle")}</span>
          <span className="text-xs text-muted">{t("insightsBody")}</span>
        </span>
        <span aria-hidden="true" className="text-muted">→</span>
      </Link>

      <Link href={`/c/${circleId}/import`}
        className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-rule bg-paper-2 px-4 hover:border-muted">
        <span>
          <span className="block font-display text-lg leading-tight">{t("importTitle")}</span>
          <span className="text-xs text-muted">{t("importBody")}</span>
        </span>
        <span aria-hidden="true" className="text-muted">→</span>
      </Link>

      <section className="grid gap-4 rounded-md bg-second-deep p-4 text-on-second">
        <div>
          <h2 className="font-display text-lg">{t("invites.title")}</h2>
          <p className="mt-1 text-sm text-on-second-muted">{t("invites.body")}</p>
        </div>

        {active.length === 0 ? (
          <p className="text-sm text-on-second-muted">{isAdmin ? t("invites.none") : t("invites.noneMember")}</p>
        ) : (
          <ul className="grid gap-3">
            {active.map((inv) => (
              <li key={inv.id} className="grid gap-2 rounded-sm border border-on-second-muted/30 p-3">
                <p className="tabular font-semibold tracking-[0.16em]">{inv.code}</p>
                <p className="text-xs text-on-second-muted">
                  {inv.expiresAt ? t("invites.expires", { date: format.dateTime(inv.expiresAt, { day: "numeric", month: "short" }) }) : t("invites.never")}
                  {" · "}
                  {inv.maxUses !== null ? t("invites.usesOf", { used: inv.uses, max: inv.maxUses }) : t("invites.uses", { used: inv.uses })}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <CopyInvite url={`${origin}/${locale}/join/${inv.code}`} />
                  {isAdmin && (
                    <form action={revokeInviteAction}>
                      {hidden}
                      <input type="hidden" name="inviteId" value={inv.id} />
                      <button className="min-h-11 rounded-full border border-on-second-muted/40 px-4 text-sm hover:bg-paper/10">{t("invites.revoke")}</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {isAdmin && (
          <form action={createInviteAction} className="grid gap-3 border-t border-on-second-muted/30 pt-4">
            {hidden}
            <p className="text-sm font-semibold">{t("invites.new")}</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs text-on-second-muted">
                {t("invites.expiry")}
                <select name="expiry" defaultValue="7d" className={field}>
                  {(Object.keys(EXPIRY_CHOICES) as (keyof typeof EXPIRY_CHOICES)[]).map((k) => (
                    <option key={k} value={k}>{t(`invites.expiryChoices.${k}`)}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-on-second-muted">
                {t("invites.maxUses")}
                <select name="maxUses" defaultValue="" className={field}>
                  <option value="">{t("invites.unlimited")}</option>
                  {MAX_USES_CHOICES.map((n) => <option key={n} value={n}>{t("invites.people", { count: n })}</option>)}
                </select>
              </label>
            </div>
            <button className="min-h-11 w-fit rounded-full bg-accent px-5 font-semibold text-on-accent hover:bg-accent-hover">{t("invites.create")}</button>
          </form>
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="text-sm text-muted">{t("members")} · {members.length}</h2>
        <ul className="grid">
          {members.map((m) => (
            <li key={m.id} className="grid gap-2 border-b border-rule py-2">
              <div className="flex min-h-10 items-center gap-3">
                <Avatar user={m} size={32} />
                <Link href={`/c/${circleId}/p/${m.id}`} className="inline-flex min-h-10 items-center font-semibold hover:text-accent">{m.name}</Link>
                {m.role === "admin" && <span className="ml-auto rounded-full border border-rule px-2 text-[11px] text-muted">{t("admin")}</span>}
              </div>
              {isAdmin && m.id !== user.id && (
                <div className="flex flex-wrap items-center gap-2 pl-11">
                  <form action={setMemberRoleAction}>
                    {hidden}
                    <input type="hidden" name="targetId" value={m.id} />
                    <input type="hidden" name="role" value={m.role === "admin" ? "member" : "admin"} />
                    <button className={smallBtn}>{m.role === "admin" ? t("actions.makeMember") : t("actions.makeAdmin")}</button>
                  </form>
                  <details>
                    <summary className={`${smallBtn} inline-flex list-none items-center marker:content-none`}>{t("actions.remove")}</summary>
                    <form action={removeMemberAction} className="mt-2 flex items-center gap-2">
                      {hidden}
                      <input type="hidden" name="targetId" value={m.id} />
                      <button className="min-h-9 rounded-full bg-accent px-3 text-xs font-semibold text-on-accent">{t("actions.confirmRemove", { name: m.name })}</button>
                    </form>
                  </details>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <details className="rounded-md border border-rule p-3">
        <summary className="min-h-9 cursor-pointer list-none text-sm text-muted marker:content-none hover:text-ink">{t("leave.title")}</summary>
        <form action={leaveCircleAction} className="mt-3 grid gap-3">
          {hidden}
          <p className="text-sm text-muted">{t("leave.body")}</p>
          <button className="min-h-11 w-fit rounded-full border border-accent px-5 text-sm font-semibold text-accent">{t("leave.confirm")}</button>
        </form>
      </details>

      {isAdmin && (
        <details className="rounded-md border border-rule p-3">
          <summary className="min-h-10 cursor-pointer list-none text-sm text-muted marker:content-none hover:text-accent">{tm("deleteCircle")}</summary>
          <form action={deleteCircleAction} className="mt-3 grid gap-3">
            {hidden}
            <p className="text-sm text-muted">{tm("deleteCircleWarn")}</p>
            <label htmlFor="del-name" className="text-sm">{tm("deleteCircleConfirm", { name: circle!.name })}</label>
            <input id="del-name" name="name" required autoComplete="off" className={field} />
            <button className="min-h-11 w-fit rounded-full bg-accent px-5 text-sm font-semibold text-on-accent">{tm("deleteCircleGo")}</button>
          </form>
        </details>
      )}

      <Link href="/account" className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-rule bg-paper-2 px-4 hover:border-muted">
        <span>
          <span className="block font-display text-lg leading-tight">{tm("accountTitle")}</span>
          <span className="text-xs text-muted">{tm("accountBody")}</span>
        </span>
        <span aria-hidden="true" className="text-muted">→</span>
      </Link>

      <AccountControls initialTheme={parseTheme((await cookies()).get(THEME_COOKIE)?.value)} />
      <nav className="flex gap-4 text-xs text-muted" aria-label={tm("legal")}>
        <Link href="/privacy" className="inline-flex min-h-10 items-center underline underline-offset-4 hover:text-ink">{tm("privacy")}</Link>
        <Link href="/terms" className="inline-flex min-h-10 items-center underline underline-offset-4 hover:text-ink">{tm("terms")}</Link>
      </nav>
      <TmdbAttribution />
    </main>
  );
}
