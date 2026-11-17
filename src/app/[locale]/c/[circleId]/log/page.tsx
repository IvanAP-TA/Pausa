import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getMedia, getMembers } from "@/lib/data";
import { tmdbEnabled } from "@/lib/tmdb";
import { LogForm } from "./log-form";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tabs" });
  return { title: t("log"), robots: { index: false } };
}

export default async function NewLog({ params, searchParams }: PageProps<"/[locale]/c/[circleId]/log">) {
  const { locale, circleId } = await params;
  // Coming from a Serata: ?media=<winner>&with=<participant ids> prefill the form.
  const { media, with: withParam } = await searchParams;
  setRequestLocale(locale);
  const user = await requireUser();
  const [members, t, picked] = await Promise.all([
    getMembers(circleId),
    getTranslations("log"),
    typeof media === "string" ? getMedia(media, locale) : Promise.resolve(null),
  ]);
  const initialWith = (Array.isArray(withParam) ? withParam : withParam ? [withParam] : []).filter((id) => members.some((m) => m.id === id));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="grid gap-6 px-4 pb-8 pt-6">
      <h1 className="display">{t("title")}</h1>
      <LogForm
        circleId={circleId}
        today={today}
        tmdb={tmdbEnabled()}
        initialPicked={picked}
        initialWith={initialWith}
        members={members.filter((m) => m.id !== user.id).map((m) => ({ id: m.id, name: m.name }))}
      />
    </main>
  );
}
