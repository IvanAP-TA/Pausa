import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getCircleLists } from "@/lib/data";
import { createList } from "@/lib/actions";
import { ListCard } from "@/components/list-card";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "lists" });
  return { title: t("mine"), robots: { index: false } };
}

/** My own lists (watchlist first): only I see them. The group's lists live in each Cerchia. */
export default async function MyLists({ params }: PageProps<"/[locale]/me/lists">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [mine, t] = await Promise.all([getCircleLists(null, locale, user.id), getTranslations("lists")]);
  const ordered = [...mine].sort((a, b) => Number(b.kind === "watchlist") - Number(a.kind === "watchlist"));

  return (
    <main className="grid gap-10 px-4 pb-10 pt-6">
      <header className="grid gap-2">
        <h1 className="display">{t("mine")}</h1>
        <p className="max-w-prose text-ink-2">{t("mineLede")}</p>
      </header>

      {ordered.length === 0
        ? <p className="empty well grained p-5 text-ink-2">{t("emptyPersonal")}</p>
        : <div className="grid">{ordered.map((l) => <ListCard key={l.id} list={l} personal canDelete={l.ownerId === user.id} />)}</div>}

      <form action={createList} className="well grid gap-4 p-5">
        <h2 className="title">{t("newTitle")}</h2>
        <input type="hidden" name="scope" value="personal" />
        <div className="grid gap-1">
          <label htmlFor="list-name" className="field-label">{t("name")}</label>
          <input id="list-name" name="name" required maxLength={80} autoComplete="off" className="field" />
        </div>
        <select name="kind" aria-label={t("newTitle")} defaultValue="watchlist" className="field">
          <option value="watchlist">{t("kind.watchlist")}</option>
          <option value="list">{t("kind.list")}</option>
          <option value="ranking">{t("kind.ranking")}</option>
        </select>
        <button className="btn btn-primary w-full sm:w-fit">{t("create")}</button>
      </form>
    </main>
  );
}
