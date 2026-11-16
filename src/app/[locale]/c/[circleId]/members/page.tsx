import { cookies, headers } from "next/headers";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getCircleForMember, getMembers } from "@/lib/data";
import { getDb } from "@/db";
import { EXPIRY_CHOICES, MAX_USES_CHOICES, listInvites } from "@/lib/core/circles";
import {
  createInviteAction, leaveCircleAction, removeMemberAction, revokeInviteAction, setMemberRoleAction,
} from "@/lib/actions";
import { Avatar } from "@/components/avatar";
import { TmdbAttribution } from "@/components/tmdb-attribution";
import { CopyInvite } from "./copy-invite";
import { AccountControls } from "./account-controls";

const field = "min-h-11 w-full min-w-0 rounded-sm border border-rule bg-paper-2 px-2 text-sm text-ink";
const smallBtn = "min-h-9 rounded-full border border-rule px-3 text-xs text-muted hover:text-ink";

export default async function Members({ params, searchParams }: PageProps<"/[locale]/c/[circleId]/members">) {
  const { locale, circleId } = await params;
  const { e } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser();
  const now = new Date();
  const [circle, members, invites, t, format] = await Promise.all([
    getCircleForMember(circleId, user.id),
    getMembers(circleId),
    getDb().then((db) => listInvites(db, circleId, now)),
    getTranslations("circle"),
    getFormatter(),
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
  const error = typeof e === "string" && ["forbidden", "last_admin", "not_member"].includes(e) ? e : null;

  return (
    <main className="grid gap-8 px-4 pb-8 pt-6">
      <h1 className="font-display text-[1.75rem] leading-tight">{circle!.name}</h1>

      {error && <p role="alert" className="rounded-md border border-accent p-3 text-sm text-accent">{t(`errors.${error}`)}</p>}

      <Link href={`/c/${circleId}/insights`}
        className="flex min-h-14 items-center justify-between gap-3 rounded-md border border-rule bg-paper-2 px-4 hover:border-muted">
        <span>
          <span className="block font-display text-lg leading-tight">{t("insightsTitle")}</span>
          <span className="text-xs text-muted">{t("insightsBody")}</span>
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
                <span className="font-semibold">{m.name}</span>
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

      <AccountControls initialTheme={parseTheme((await cookies()).get(THEME_COOKIE)?.value)} />
      <TmdbAttribution />
    </main>
  );
}
