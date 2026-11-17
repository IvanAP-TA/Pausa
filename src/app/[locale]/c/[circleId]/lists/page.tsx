import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getCircleForMember, getCircleLists } from "@/lib/data";
import { createList } from "@/lib/actions";
import { deleteListAction, moveListItemAction, removeListItemAction, renameListAction } from "@/lib/manage-actions";
import { Poster } from "@/components/poster";
import { ListAdd } from "./list-add";

type ListRow = Awaited<ReturnType<typeof getCircleLists>>[number];

const small = "inline-flex min-h-9 min-w-9 items-center justify-center rounded-full border border-rule px-2 text-sm text-muted hover:text-ink disabled:opacity-30";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tabs" });
  return { title: t("lists"), robots: { index: false } };
}

export default async function Lists({ params }: PageProps<"/[locale]/c/[circleId]/lists">) {
  const { locale, circleId } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [circle, groupLists, myLists, t, tm] = await Promise.all([
    getCircleForMember(circleId, user.id),
    getCircleLists(circleId, locale),
    getCircleLists(null, locale, user.id),
    getTranslations("lists"),
    getTranslations("manage"),
  ]);
  const isAdmin = circle?.role === "admin";

  const card = (list: ListRow, personal: boolean) => {
    const canDelete = list.ownerId === user.id || (!personal && isAdmin);
    const ranking = list.kind === "ranking";
    return (
      <section key={list.id} className="grid gap-3 rounded-md bg-paper-2 p-4">
        <header className="min-w-0">
          <h3 className="font-display text-xl font-semibold leading-tight">{list.name}</h3>
          <p className="text-xs text-muted">
            {t(`kind.${list.kind}`)} · {t("items", { count: list.items.length })} · {personal ? t("personal") : t("by", { name: list.owner })}
          </p>
        </header>
        {list.description && <p className="text-sm text-muted">{list.description}</p>}
        {list.items.length > 0 && (
          <ol className="grid grid-cols-4 gap-2">
            {list.items.slice(0, 8).map((m, i) => (
              <li key={m.id} className="relative">
                <Poster media={m} size="sm" />
                {ranking && <span className="tabular absolute left-1 top-1 grid size-5 place-items-center rounded-full bg-paper/85 text-[11px] font-semibold">{i + 1}</span>}
                <span className="sr-only">{m.title}</span>
              </li>
            ))}
          </ol>
        )}

        <details className="border-t border-rule pt-2">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-sm text-muted marker:content-none hover:text-ink">{tm("manageList")}</summary>
          <div className="mt-3 grid gap-4">
            <ListAdd listId={list.id} />

            {list.items.length > 0 && (
              <ol className="grid gap-1">
                {list.items.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm">
                    {ranking && <span className="tabular w-5 text-right text-muted">{i + 1}</span>}
                    <span className="min-w-0 flex-1 truncate">{m.title}</span>
                    {ranking && (
                      <>
                        <form action={moveListItemAction}>
                          <input type="hidden" name="listId" value={list.id} /><input type="hidden" name="mediaId" value={m.id} /><input type="hidden" name="direction" value="up" />
                          <button disabled={i === 0} aria-label={tm("moveUp", { title: m.title })} className={small}>↑</button>
                        </form>
                        <form action={moveListItemAction}>
                          <input type="hidden" name="listId" value={list.id} /><input type="hidden" name="mediaId" value={m.id} /><input type="hidden" name="direction" value="down" />
                          <button disabled={i === list.items.length - 1} aria-label={tm("moveDown", { title: m.title })} className={small}>↓</button>
                        </form>
                      </>
                    )}
                    <form action={removeListItemAction}>
                      <input type="hidden" name="listId" value={list.id} /><input type="hidden" name="mediaId" value={m.id} />
                      <button aria-label={tm("removeItem", { title: m.title })} className={small}>×</button>
                    </form>
                  </li>
                ))}
              </ol>
            )}

            <form action={renameListAction} className="flex gap-2">
              <input type="hidden" name="listId" value={list.id} />
              <label htmlFor={`rn-${list.id}`} className="sr-only">{t("name")}</label>
              <input id={`rn-${list.id}`} name="name" required maxLength={80} defaultValue={list.name} className="min-h-11 min-w-0 flex-1 rounded-sm border border-rule bg-paper px-3 text-sm" />
              <button className="min-h-11 shrink-0 rounded-full border border-rule px-4 text-sm font-semibold hover:bg-paper-3">{tm("rename")}</button>
            </form>

            {canDelete && (
              <details>
                <summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-sm text-muted marker:content-none hover:text-accent">{tm("deleteList")}</summary>
                <form action={deleteListAction} className="mt-2 flex flex-wrap items-center gap-3">
                  <input type="hidden" name="listId" value={list.id} />
                  <p className="text-sm text-muted">{tm("deleteListWarn")}</p>
                  <button className="min-h-9 rounded-full bg-accent px-4 text-sm font-semibold text-on-accent">{tm("deleteConfirm")}</button>
                </form>
              </details>
            )}
          </div>
        </details>
      </section>
    );
  };

  return (
    <main className="grid gap-8 px-4 pb-8 pt-6">
      <h1 className="font-display text-[1.75rem] font-semibold leading-tight">{t("title")}</h1>

      <div className="grid gap-4">
        <h2 className="text-sm text-muted">{t("group")}</h2>
        {groupLists.length === 0 ? <p className="text-sm text-muted">{t("empty")}</p> : groupLists.map((l) => card(l, false))}
      </div>

      <div className="grid gap-4">
        <h2 className="text-sm text-muted">{t("mine")}</h2>
        {myLists.length === 0 ? <p className="text-sm text-muted">{t("emptyPersonal")}</p> : myLists.map((l) => card(l, true))}
      </div>

      <form action={createList} className="grid gap-3 border-t border-rule pt-6">
        <h2 className="text-sm font-semibold">{t("newTitle")}</h2>
        <input type="hidden" name="circleId" value={circleId} />
        <label htmlFor="list-name" className="sr-only">{t("name")}</label>
        <input id="list-name" name="name" required maxLength={80} placeholder={t("name")}
          className="min-h-12 rounded-sm border border-rule bg-paper-2 px-4 placeholder:text-muted/60" />
        <div className="grid grid-cols-2 gap-2">
          <select name="kind" aria-label={t("newTitle")} defaultValue="list" className="min-h-12 min-w-0 rounded-sm border border-rule bg-paper-2 px-2 text-sm">
            <option value="list">{t("kind.list")}</option>
            <option value="watchlist">{t("kind.watchlist")}</option>
            <option value="ranking">{t("kind.ranking")}</option>
          </select>
          <select name="scope" aria-label={t("scopeCircle")} defaultValue="circle" className="min-h-12 min-w-0 rounded-sm border border-rule bg-paper-2 px-2 text-sm">
            <option value="circle">{t("scopeCircle")}</option>
            <option value="personal">{t("scopePersonal")}</option>
          </select>
        </div>
        <button className="min-h-11 w-fit rounded-full border border-rule bg-paper-3 px-5 font-semibold hover:bg-rule">{t("create")}</button>
      </form>
    </main>
  );
}
