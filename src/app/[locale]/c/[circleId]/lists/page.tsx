import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getCircleForMember, getCircleLists } from "@/lib/data";
import { createList } from "@/lib/actions";
import { ListCard } from "@/components/list-card";
import { Link } from "@/i18n/navigation";
import { BackLink } from "@/components/back-link";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tabs" });
  return { title: t("lists"), robots: { index: false } };
}

export default async function Lists({ params }: PageProps<"/[locale]/c/[circleId]/lists">) {
  const { locale, circleId } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [circle, groupLists, t, tt] = await Promise.all([
    getCircleForMember(circleId, user.id),
    getCircleLists(circleId, locale),
    getTranslations("lists"),
    getTranslations("tabs"),
  ]);
  const isAdmin = circle?.role === "admin";

  return (
    <main className="grid gap-10 px-4 pb-8 pt-4">
      {/* On a phone the lists are reached from the diary (no tab of their own): the way back to it. */}
      <div className="-mb-6 lg:hidden"><BackLink href={`/c/${circleId}`} label={tt("diary")} /></div>
      <h1 className="display">{t("title")}</h1>

      <div className="grid gap-4">
        <h2 className="chapter">{t("group")}</h2>
        {groupLists.length === 0 ? <p className="empty well grained p-5 text-ink-2">{t("empty")}</p> : <div className="grid">{groupLists.map((l) => <ListCard key={l.id} list={l} personal={false} canDelete={l.ownerId === user.id || isAdmin} />)}</div>}
      </div>

      <p className="text-sm text-muted">{t("mineMoved")} <Link href="/me/lists" className="link">{t("mineLink")}</Link></p>

      <form action={createList} className="well grid gap-4 p-5">
        <h2 className="title">{t("newTitle")}</h2>
        <input type="hidden" name="circleId" value={circleId} />
        <div className="grid gap-1">
          <label htmlFor="list-name" className="field-label">{t("name")}</label>
          <input id="list-name" name="name" required maxLength={80} className="field" />
        </div>
        <div className="grid gap-3">
          <select name="kind" aria-label={t("newTitle")} defaultValue="list" className="field">
            <option value="list">{t("kind.list")}</option>
            <option value="watchlist">{t("kind.watchlist")}</option>
            <option value="ranking">{t("kind.ranking")}</option>
          </select>
        </div>
        <button className="btn btn-primary w-full sm:w-fit">{t("create")}</button>
      </form>
    </main>
  );
}
