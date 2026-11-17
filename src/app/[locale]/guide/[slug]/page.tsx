import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { siteUrl } from "@/lib/site";
import { GUIDES_UPDATED, GUIDE_SLUGS, guideFor, guideStrings, isGuideSlug } from "@/lib/guides";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => GUIDE_SLUGS.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/guide/[slug]">) {
  const { locale, slug } = await params;
  if (!isGuideSlug(slug)) return {};
  const g = guideFor(locale as Locale, slug);
  return {
    title: g.title,
    description: g.description,
    alternates: {
      canonical: `/${locale}/guide/${slug}`,
      languages: { ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}/guide/${slug}`])), "x-default": `/${routing.defaultLocale}/guide/${slug}` },
    },
    openGraph: { type: "article", title: g.title, description: g.description, siteName: "Pausa", publishedTime: GUIDES_UPDATED, images: [{ url: `/api/og/guide/${slug}?locale=${locale}`, width: 1200, height: 630, alt: g.title }] },
    twitter: { card: "summary_large_image", title: g.title, description: g.description, images: [`/api/og/guide/${slug}?locale=${locale}`] },
  };
}

export default async function GuidePage({ params }: PageProps<"/[locale]/guide/[slug]">) {
  const { locale: raw, slug } = await params;
  if (!isGuideSlug(slug)) notFound();
  setRequestLocale(raw);
  const locale = raw as Locale;
  const g = guideFor(locale, slug);
  const s = guideStrings[locale];
  const url = `${siteUrl()}/${locale}/guide/${slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article", headline: g.title, description: g.description, inLanguage: locale, datePublished: GUIDES_UPDATED, dateModified: GUIDES_UPDATED,
        mainEntityOfPage: url, author: { "@type": "Organization", name: "Pausa" }, publisher: { "@type": "Organization", name: "Pausa", url: siteUrl() },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Pausa", item: `${siteUrl()}/${locale}` },
          { "@type": "ListItem", position: 2, name: s.index, item: `${siteUrl()}/${locale}/guide` },
          { "@type": "ListItem", position: 3, name: g.title, item: url },
        ],
      },
    ],
  };

  return (
    <main className="projector mx-auto grid w-full max-w-[72rem] gap-10 px-4 pb-16 pt-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="breadcrumb" className="flex items-center gap-3 text-sm text-muted">
        <Link href="/" className="inline-flex min-h-11 items-center font-display text-2xl text-ink">Pausa</Link>
        <span aria-hidden="true">/</span>
        <Link href="/guide" className="link inline-flex min-h-11 items-center">{s.index}</Link>
      </nav>
      <article className="grid gap-10">
        <header className="grid min-w-0 gap-4">
          <h1 className="display text-poster max-w-[22ch]">{g.title}</h1>
          <p className="text-sm text-muted">{s.updated}: {GUIDES_UPDATED}</p>
          <p className="subtitle max-w-[60ch]">{g.intro}</p>
        </header>
        {/* Each block is a plate: the subhead in the margin from 64rem, the prose at a reading measure beside it. */}
        {g.blocks.map((b) => (
          <section key={b.h} className="plate grid gap-4 pt-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-12">
            <h2 className="title">{b.h}</h2>
            <div className="grid min-w-0 max-w-[65ch] content-start gap-4 text-[17px] leading-relaxed">
              {b.p?.map((p) => <p key={p}>{p}</p>)}
              {b.list && (
                <ul className="grid list-disc gap-2 pl-5 marker:text-muted">
                  {b.list.map((li) => <li key={li}>{li}</li>)}
                </ul>
              )}
            </div>
          </section>
        ))}
      </article>
      <aside className="well grained grid gap-5 p-6 sm:p-8">
        <p className="max-w-[60ch] text-lead">{g.cta}</p>
        <Link href="/#try" className="btn btn-primary btn-lg w-full sm:w-fit">{s.try}</Link>
      </aside>
      <section aria-labelledby="more-guides" className="grid gap-4">
        <h2 id="more-guides" className="title">{s.more}</h2>
        <ul className="rows grid">
          {GUIDE_SLUGS.filter((o) => o !== slug).slice((GUIDE_SLUGS.indexOf(slug)) % 3, ((GUIDE_SLUGS.indexOf(slug)) % 3) + 3).map((o) => (
            <li key={o}><Link href={`/guide/${o}`} className="flex min-h-12 items-center py-3 font-display text-2xl text-ink transition-colors duration-150 hover:bg-paper-2">{guideFor(locale, o).title}</Link></li>
          ))}
        </ul>
      </section>
      <nav className="flex flex-wrap gap-4 text-sm"><Link href="/guide" className="link inline-flex min-h-11 items-center">{s.back}</Link></nav>
    </main>
  );
}
