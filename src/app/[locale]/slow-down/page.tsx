import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export const metadata = { robots: { index: false } };

/** Where a person lands when they have done something too many times in an hour (see core/limits.ts). */
export default async function SlowDown({ params }: PageProps<"/[locale]/slow-down">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("errors");
  return (
    <main className="projector mx-auto grid min-h-dvh max-w-md content-center gap-4 px-5 py-12">
      <p className="font-display text-sm text-accent">Pausa</p>
      <h1 className="font-display text-[2rem] leading-tight">{t("slowTitle")}</h1>
      <p className="text-muted">{t("slowBody")}</p>
      <Link href="/" className="mt-2 inline-flex min-h-12 w-fit items-center rounded-full bg-accent px-6 font-semibold text-on-accent hover:bg-accent-hover">{t("home")}</Link>
    </main>
  );
}
