import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getCircleForMember, getCircleLists } from "@/lib/data";
import { createList } from "@/lib/actions";
import { deleteListAction, moveListItemAction, removeListItemAction, renameListAction } from "@/lib/manage-actions";
import { Poster } from "@/components/poster";
import { ListAdd } from "./list-add";
import { ArrowDown, ArrowUp, ChevronDown, X } from "lucide-react";

type ListRow = Awaited<ReturnType<typeof getCircleLists>>[number];

// A square icon button inside a row: 44px, a rule outline.
const small = "btn btn-quiet size-11 shrink-0 p-0";

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
      <section key={list.id} className="plate grid gap-4 pb-2 pt-5">
        <header className="grid min-w-0 gap-1">
          <h3 className="title">{list.name}</h3>
          <p className="text-sm text-muted">
            {t(`kind.${list.kind}`)}, {t("items", { count: list.items.length })}, {personal ? t("personal") : t("by", { name: list.owner })}
          </p>
        </header>
        {list.description && <p className="text-ink-2">{list.description}</p>}
        {list.items.length > 0 && (
          // The contact strip: prints side by side, scrolling sideways on a phone.
          <ol tabIndex={0} className="-mx-4 flex snap-x scroll-pl-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {list.items.slice(0, 8).map((m, i) => (
              <li key={m.id} className="grid w-[104px] shrink-0 snap-start content-start gap-2">
                <Poster media={m} size="sm" />
                <span className="flex min-w-0 items-baseline gap-2">
                  {ranking && <span className="figure text-2xl text-ink">{i + 1}</span>}
                  <span className="line-clamp-2 min-w-0 text-sm leading-snug text-ink-2 [overflow-wrap:anywhere]">{m.title}</span>
                </span>
              </li>
            ))}
          </ol>
        )}

        <details className="group">
          <summary className="flex min-h-11 w-fit list-none items-center gap-2 text-sm text-ink-2 transition-colors duration-150 marker:content-none hover:text-ink">
            {tm("manageList")}
            <ChevronDown size={16} strokeWidth={1.6} aria-hidden="true" className="text-muted transition-transform duration-150 group-open:rotate-180" />
          </summary>
          <div className="grid gap-6 pb-4 pt-2">
            <ListAdd listId={list.id} />

            {list.items.length > 0 && (
              <ol className="rows grid">
                {list.items.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-2 py-1.5">
                    {ranking && <span className="figure w-8 shrink-0 text-2xl text-ink">{i + 1}</span>}
                    <span className="min-w-0 flex-1 truncate">{m.title}</span>
                    {ranking && (
                      <>
                        <form action={moveListItemAction}>
                          <input type="hidden" name="listId" value={list.id} /><input type="hidden" name="mediaId" value={m.id} /><input type="hidden" name="direction" value="up" />
                          <button disabled={i === 0} aria-label={tm("moveUp", { title: m.title })} className={small}>
                            <ArrowUp size={18} strokeWidth={1.6} aria-hidden="true" />
                          </button>
                        </form>
                        <form action={moveListItemAction}>
                          <input type="hidden" name="listId" value={list.id} /><input type="hidden" name="mediaId" value={m.id} /><input type="hidden" name="direction" value="down" />
                          <button disabled={i === list.items.length - 1} aria-label={tm("moveDown", { title: m.title })} className={small}>
                            <ArrowDown size={18} strokeWidth={1.6} aria-hidden="true" />
                          </button>
                        </form>
                      </>
                    )}
                    <form action={removeListItemAction}>
                      <input type="hidden" name="listId" value={list.id} /><input type="hidden" name="mediaId" value={m.id} />
                      <button aria-label={tm("removeItem", { title: m.title })} className={small}>
                        <X size={18} strokeWidth={1.6} aria-hidden="true" />
                      </button>
                    </form>
                  </li>
                ))}
              </ol>
            )}

            <form action={renameListAction} className="grid gap-2">
              <input type="hidden" name="listId" value={list.id} />
              <label htmlFor={`rn-${list.id}`} className="field-label">{t("name")}</label>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input id={`rn-${list.id}`} name="name" required maxLength={80} defaultValue={list.name} className="field" />
                <button className="btn w-full sm:w-fit">{tm("rename")}</button>
              </div>
            </form>

            {canDelete && (
              <details>
                <summary className="inline-flex min-h-11 list-none items-center text-sm text-muted transition-colors duration-150 marker:content-none hover:text-error">{tm("deleteList")}</summary>
                <form action={deleteListAction} className="grid gap-3 pt-1">
                  <input type="hidden" name="listId" value={list.id} />
                  <p className="text-sm text-ink-2">{tm("deleteListWarn")}</p>
                  <button className="btn btn-quiet w-full text-error sm:w-fit">{tm("deleteConfirm")}</button>
                </form>
              </details>
            )}
          </div>
        </details>
      </section>
    );
  };

  return (
    <main className="grid gap-10 px-4 pb-8 pt-8">
      <h1 className="display">{t("title")}</h1>

      <div className="grid gap-4">
        <h2 className="text-ink-2">{t("group")}</h2>
        {groupLists.length === 0 ? <p className="well grained p-5 text-ink-2">{t("empty")}</p> : <div className="grid">{groupLists.map((l) => card(l, false))}</div>}
      </div>

      <div className="grid gap-4">
        <h2 className="text-ink-2">{t("mine")}</h2>
        {myLists.length === 0 ? <p className="well grained p-5 text-ink-2">{t("emptyPersonal")}</p> : <div className="grid">{myLists.map((l) => card(l, true))}</div>}
      </div>

      <form action={createList} className="well grid gap-4 p-5">
        <h2 className="title">{t("newTitle")}</h2>
        <input type="hidden" name="circleId" value={circleId} />
        <div className="grid gap-1">
          <label htmlFor="list-name" className="field-label">{t("name")}</label>
          <input id="list-name" name="name" required maxLength={80} className="field" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select name="kind" aria-label={t("newTitle")} defaultValue="list" className="field">
            <option value="list">{t("kind.list")}</option>
            <option value="watchlist">{t("kind.watchlist")}</option>
            <option value="ranking">{t("kind.ranking")}</option>
          </select>
          <select name="scope" aria-label={t("scopeCircle")} defaultValue="circle" className="field">
            <option value="circle">{t("scopeCircle")}</option>
            <option value="personal">{t("scopePersonal")}</option>
          </select>
        </div>
        <button className="btn btn-primary w-full sm:w-fit">{t("create")}</button>
      </form>
    </main>
  );
}
