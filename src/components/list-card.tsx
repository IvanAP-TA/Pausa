import { getTranslations } from "next-intl/server";
import { ArrowDown, ArrowUp, ChevronDown, Trash2, X } from "lucide-react";
import type { getCircleLists } from "@/lib/data";
import { deleteListAction, moveListItemAction, removeListItemAction, renameListAction } from "@/lib/manage-actions";
import { ConfirmForm } from "./confirm-form";
import { ListAdd } from "./list-add";
import { Poster } from "./poster";

export type ListRow = Awaited<ReturnType<typeof getCircleLists>>[number];

// A square icon button inside a row: 44px, a rule outline.
const small = "btn btn-quiet size-11 shrink-0 p-0";

/**
 * One list, the same in a Cerchia and on a profile: name, who made it, a strip of posters, and "Gestisci" to add, reorder,
 * remove and rename. The bin sits in the header, in plain sight, and asks before it deletes.
 * `canDelete`: the owner, or an admin for a group list.
 */
export async function ListCard({ list, personal, canDelete }: { list: ListRow; personal: boolean; canDelete: boolean }) {
  const [t, tm, tc] = await Promise.all([getTranslations("lists"), getTranslations("manage"), getTranslations("common")]);
  const ranking = list.kind === "ranking";
  return (
      <section key={list.id} className="plate grid gap-4 pb-2 pt-5">
        <header className="flex items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <h3 className="title [overflow-wrap:anywhere]">{list.name}</h3>
            <p className="text-sm text-muted">
              {t(`kind.${list.kind}`)}, {t("items", { count: list.items.length })}, {personal ? t("personal") : t("by", { name: list.owner })}
            </p>
          </div>
          {canDelete && (
            <ConfirmForm
              action={deleteListAction}
              fields={{ listId: list.id }}
              trigger={<Trash2 size={20} strokeWidth={1.6} aria-hidden="true" />}
              triggerLabel={tm("deleteListNamed", { name: list.name })}
              triggerClassName="btn btn-quiet size-11 shrink-0 p-0 text-muted hover:text-error"
              title={tm("deleteList")}
              body={<p>{personal ? tm("deleteListWarnPersonal") : tm("deleteListWarn")}</p>}
              confirm={tm("deleteConfirm")}
              cancel={tc("cancel")}
            />
          )}
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

          </div>
        </details>
      </section>
  );
}
