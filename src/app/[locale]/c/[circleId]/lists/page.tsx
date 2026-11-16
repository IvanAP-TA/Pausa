import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getCircleLists } from "@/lib/data";
import { createList } from "@/lib/actions";
import { Poster } from "@/components/poster";

type ListRow = Awaited<ReturnType<typeof getCircleLists>>[number];

export default async function Lists({ params }: PageProps<"/[locale]/c/[circleId]/lists">) {
  const { locale, circleId } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [groupLists, myLists, t] = await Promise.all([
    getCircleLists(circleId, locale),
    getCircleLists(null, locale, user.id),
    getTranslations("lists"),
  ]);

  const card = (list: ListRow, personal: boolean) => (
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
              {list.kind === "ranking" && (
                <span className="tabular absolute left-1 top-1 grid size-5 place-items-center rounded-full bg-paper/85 text-[11px] font-semibold">{i + 1}</span>
              )}
              <span className="sr-only">{m.title}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );

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
