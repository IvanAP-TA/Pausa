import { cookies } from "next/headers";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Download, ListChecks, Lock, Plus, Trash2, Users, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/session";
import { getMyCircles, getMyDiary, getMyDiaryCounts } from "@/lib/data";
import { deleteMyLogAction, setLogScopeAction, shareLogAction, unshareLogAction } from "@/lib/space-actions";
import { formatProgress } from "@/lib/core/progress";
import { ConfirmForm } from "@/components/confirm-form";
import { LAST_CIRCLE_COOKIE } from "@/components/circle-memory";
import { Poster } from "@/components/poster";
import { Stars } from "@/components/stars";
import { SubmitButton } from "@/components/submit-button";

const PAGE = 40;
const NOTICES = ["shared", "unshared", "private", "open", "logged", "deleted"] as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/me/diary">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "space" });
  return { title: t("diaryTitle"), robots: { index: false } };
}

/**
 * My space: everything I watched, whoever can read it. Each row says where it shows (every Cerchia, some, or only here)
 * and carries the one action that changes it, plus the bin that deletes it for good. What I import lands here.
 */
export default async function MyDiary({ params, searchParams }: PageProps<"/[locale]/me/diary">) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser();
  const only = sp.only === "private" ? "private" as const : undefined;
  const before = typeof sp.before === "string" ? sp.before.slice(0, 80) : undefined;
  const notice = NOTICES.find((n) => n === sp.ok);

  const [circles, counts, rows, t, tf, tk, format] = await Promise.all([
    getMyCircles(user.id), getMyDiaryCounts(user.id), getMyDiary(user.id, locale, PAGE + 1, before, only),
    getTranslations("space"), getTranslations("feed"), getTranslations("kind"), getFormatter(),
  ]);
  const last = (await cookies()).get(LAST_CIRCLE_COOKIE)?.value;
  const home = circles.find((c) => c.id === last) ?? circles[0] ?? null;
  const nameOf = new Map(circles.map((c) => [c.id, c.name]));
  const shown = rows.slice(0, PAGE);
  const tab = (active: boolean) => `inline-flex min-h-11 items-center border-b-2 px-1 text-sm transition-colors duration-150 ${active ? "border-accent font-semibold text-ink" : "border-transparent text-muted hover:text-ink"}`;
  const hidden = (logId: string) => (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="logId" value={logId} />
      {only && <input type="hidden" name="only" value={only} />}
    </>
  );

  return (
    <main className="grid gap-6 px-4 pb-12 pt-2">
      <header className="grid gap-3">
        <h1 className="display">{t("diaryTitle")}</h1>
        <p className="max-w-prose text-ink-2">{t("lede")}</p>
        <div className="flex flex-wrap gap-2">
          {home && (
            <Link href={`/c/${home.id}/log?private=1`} className="btn btn-primary">
              <Plus size={18} strokeWidth={1.8} aria-hidden="true" />{t("add")}
            </Link>
          )}
          <Link href="/me/import" className="btn">
            <Download size={18} strokeWidth={1.6} aria-hidden="true" />{t("import")}
          </Link>
          <Link href="/me/imports" className="btn btn-quiet">
            <ListChecks size={18} strokeWidth={1.6} aria-hidden="true" />{t("manageImports")}
          </Link>
        </div>
      </header>

      {notice && <p role="status" className="well p-3 text-sm">{t(`notice.${notice}`)}</p>}

      <nav aria-label={t("show")} className="flex gap-5 border-b border-rule">
        <Link href="/me/diary" aria-current={!only ? "page" : undefined} className={tab(!only)}>{t("all", { count: counts.all })}</Link>
        <Link href="/me/diary?only=private" aria-current={only ? "page" : undefined} className={tab(Boolean(only))}>{t("onlyPrivate", { count: counts.private })}</Link>
      </nav>

      {shown.length === 0 ? (
        <section className="well empty grid gap-3 p-6">
          <h2 className="title">{only ? t("emptyPrivateTitle") : t("emptyTitle")}</h2>
          <p className="text-ink-2">{t("emptyBody")}</p>
        </section>
      ) : (
        <ul className="rows grid">
          {shown.map((log) => {
            const others = circles.filter((c) => !log.sharedWith.includes(c.id));
            const facts = [
              tk(log.media.kind),
              log.media.year ? String(log.media.year) : null,
              log.episode ? formatProgress({ season: log.season, episode: log.episode }) : log.season ? tf("season", { n: log.season }) : null,
            ].filter(Boolean);
            return (
              <li key={log.id} id={`l-${log.id}`} className="grid scroll-mt-16 grid-cols-[72px_minmax(0,1fr)_auto] gap-x-4 gap-y-3 py-5">
                {home ? <Link href={`/c/${home.id}/m/${log.media.id}`} aria-label={tf("openTitle", { title: log.media.title })} className="self-start"><Poster media={log.media} size="sm" /></Link> : <Poster media={log.media} size="sm" />}
                <div className="grid min-w-0 content-start gap-1.5">
                  <h2 className="title text-xl">{log.media.title}</h2>
                  <p className="text-sm text-muted">
                    {facts.join(", ")} · <time dateTime={log.watchedOn}>{format.dateTime(new Date(`${log.watchedOn}T12:00:00Z`), { day: "numeric", month: "long", year: "numeric" })}</time>
                  </p>
                  {log.rating ? <Stars className="text-base" rating={log.rating} label={tf("rating", { stars: log.rating / 2 })} /> : null}
                </div>
                <ConfirmForm
                  action={deleteMyLogAction}
                  fields={{ logId: log.id, locale, ...(only ? { only } : {}) }}
                  trigger={<Trash2 size={18} strokeWidth={1.6} aria-hidden="true" />}
                  triggerLabel={t("delete", { title: log.media.title })}
                  triggerClassName="-mr-2 -mt-2 grid size-11 place-items-center self-start text-muted transition-colors duration-150 hover:text-error"
                  title={t("deleteTitle", { title: log.media.title })}
                  body={<p>{log.scope === "circles" || log.sharedWith.length > 0 ? t("deleteBodyShared") : t("deleteBody")}</p>}
                  confirm={t("deleteCta")}
                  cancel={t("cancel")}
                  pending={t("deleting")}
                />

                {/* Where this log shows, and the one thing to do about it. */}
                <div className="col-span-full grid gap-2">
                  {log.scope === "circles" ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm text-ink-2"><Users size={16} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />{t("inAllCircles")}</p>
                      <form action={setLogScopeAction}>
                        {hidden(log.id)}
                        <input type="hidden" name="scope" value="private" />
                        <SubmitButton className="btn btn-quiet btn-sm" pending={t("saving")}>{t("makePrivate")}</SubmitButton>
                      </form>
                    </div>
                  ) : (
                    <>
                      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
                        <Lock size={16} strokeWidth={1.6} aria-hidden="true" className="shrink-0" />
                        {log.sharedWith.length === 0 ? t("onlyYou") : t("sharedWith")}
                      </p>
                      {log.sharedWith.length > 0 && (
                        <ul className="flex flex-wrap gap-2">
                          {log.sharedWith.map((cid) => (
                            <li key={cid}>
                              <form action={unshareLogAction} className="inline-flex items-center border border-rule">
                                {hidden(log.id)}
                                <input type="hidden" name="circleId" value={cid} />
                                <span className="px-2.5 text-sm">{nameOf.get(cid) ?? "…"}</span>
                                <button aria-label={t("removeFrom", { circle: nameOf.get(cid) ?? "" })} className="grid size-11 place-items-center border-l border-rule text-muted transition-colors duration-150 hover:bg-paper-2 hover:text-ink">
                                  <X size={16} strokeWidth={1.8} aria-hidden="true" />
                                </button>
                              </form>
                            </li>
                          ))}
                        </ul>
                      )}
                      {others.length === 1 ? (
                        <form action={shareLogAction}>
                          {hidden(log.id)}
                          <input type="hidden" name="circleId" value={others[0].id} />
                          <SubmitButton className="btn btn-sm" pending={t("saving")}><Plus size={16} strokeWidth={1.8} aria-hidden="true" />{t("addTo", { circle: others[0].name })}</SubmitButton>
                        </form>
                      ) : others.length > 1 ? (
                        <form action={shareLogAction} className="flex flex-wrap gap-2">
                          {hidden(log.id)}
                          <label htmlFor={`to-${log.id}`} className="sr-only">{t("addToGroup")}</label>
                          <select id={`to-${log.id}`} name="circleId" required defaultValue="" className="field min-h-9 min-w-0 flex-1 py-1 text-sm">
                            <option value="" disabled>{t("addToGroup")}</option>
                            {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <SubmitButton className="btn btn-sm shrink-0" pending={t("saving")}>{t("addShort")}</SubmitButton>
                        </form>
                      ) : null}
                      {circles.length > 1 && log.sharedWith.length < circles.length && (
                        <form action={setLogScopeAction}>
                          {hidden(log.id)}
                          <input type="hidden" name="scope" value="circles" />
                          <SubmitButton className="link min-h-9 text-sm" pending={t("saving")}>{t("openToAll")}</SubmitButton>
                        </form>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > PAGE && (
        <div className="grid justify-items-center">
          <Link href={`/me/diary?before=${encodeURIComponent(shown[PAGE - 1].watchedOn + shown[PAGE - 1].id)}${only ? "&only=private" : ""}`} className="btn">{tf("older")}</Link>
        </div>
      )}
    </main>
  );
}
