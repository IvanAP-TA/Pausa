import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { GUIDE_SLUGS, guideFor, guideStrings } from "@/lib/guides";
import { SITE_ID, ldJson, orgNode, websiteNode } from "@/lib/jsonld";
import { siteUrl } from "@/lib/site";

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
  const url = `${siteUrl()}/${locale}/guide`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      orgNode(),
      websiteNode(),
      {
        "@type": "CollectionPage", "@id": url, url, name: s.indexTitle, description: s.indexLede, inLanguage: locale, isPartOf: { "@id": SITE_ID() },
        mainEntity: { "@type": "ItemList", itemListElement: GUIDE_SLUGS.map((slug, i) => ({ "@type": "ListItem", position: i + 1, url: `${url}/${slug}`, name: guideFor(locale, slug).title })) },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Pausa", item: `${siteUrl()}/${locale}` },
          { "@type": "ListItem", position: 2, name: s.index, item: url },
        ],
      },
    ],
  };
  return (
    <main className="projector mx-auto grid w-full max-w-[72rem] gap-10 px-4 pb-16 pt-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }} />
      <Link href="/" className="inline-flex min-h-11 w-fit items-center font-display text-2xl text-ink">Pausa</Link>
      <header className="grid min-w-0 gap-4">
        <h1 className="display text-poster">{s.indexTitle}</h1>
        <p className="max-w-[65ch] text-lg text-ink-2">{s.indexLede}</p>
      </header>
      {/* The index is a sheet of rows: the title in capitals, the summary beside it from 64rem. */}
      <ul className="rows grid">
        {GUIDE_SLUGS.map((slug) => {
          const g = guideFor(locale, slug);
          return (
            <li key={slug}>
              <Link href={`/guide/${slug}`} className="group grid gap-2 py-5 transition-colors duration-150 hover:bg-paper-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)_auto] lg:items-baseline lg:gap-8">
                <h2 className="title">{g.title}</h2>
                <p className="max-w-[65ch] text-ink-2">{g.description}</p>
                <span className="text-sm text-ink underline decoration-muted underline-offset-4 transition-colors duration-150 group-hover:decoration-accent">{s.read}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
