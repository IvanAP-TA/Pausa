import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { GUIDE_SLUGS, guideFor, guideStrings } from "@/lib/guides";

export async function generateMetadata({ params }: PageProps<"/[locale]/guide">) {
  const { locale } = await params;
  const s = guideStrings[locale as Locale];
  return {
    title: s.indexTitle,
    description: s.indexLede,
    alternates: {
      canonical: `/${locale}/guide`,
      languages: { ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}/guide`])), "x-default": `/${routing.defaultLocale}/guide` },
    },
    openGraph: { type: "website", title: s.indexTitle, description: s.indexLede, siteName: "Pausa" },
  };
}

export default async function GuideIndex({ params }: PageProps<"/[locale]/guide">) {
  const { locale: raw } = await params;
  setRequestLocale(raw);
  const locale = raw as Locale;
  const s = guideStrings[locale];
  return (
    <main className="projector mx-auto grid max-w-2xl gap-8 px-5 py-12">
      <Link href="/" className="inline-flex min-h-8 w-fit items-center font-display text-lg text-ink">Pausa</Link>
      <header className="grid gap-2">
        <h1 className="font-display text-[2rem] leading-tight">{s.indexTitle}</h1>
        <p className="text-muted">{s.indexLede}</p>
      </header>
      <ul className="grid gap-4">
        {GUIDE_SLUGS.map((slug) => {
          const g = guideFor(locale, slug);
          return (
            <li key={slug}>
              <Link href={`/guide/${slug}`} className="grid gap-1 rounded-md border border-rule bg-paper-2 p-4 hover:border-muted">
                <h2 className="font-display text-xl leading-tight">{g.title}</h2>
                <p className="text-sm text-muted">{g.description}</p>
                <span className="mt-1 text-sm font-semibold text-accent">{s.read} →</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
