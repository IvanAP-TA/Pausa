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
    <main className="projector mx-auto grid max-w-2xl gap-8 px-5 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="breadcrumb" className="flex items-center gap-2 text-sm text-muted">
        <Link href="/" className="inline-flex min-h-10 items-center font-display text-lg text-ink">Pausa</Link>
        <span aria-hidden="true">/</span>
        <Link href="/guide" className="inline-flex min-h-10 items-center underline-offset-4 hover:text-ink hover:underline">{s.index}</Link>
      </nav>
      <article className="grid gap-6">
        <header className="grid gap-3">
          <h1 className="font-display text-[2rem] leading-[1.08]">{g.title}</h1>
          <p className="text-xs text-muted">{s.updated}: {GUIDES_UPDATED}</p>
          <p className="text-[17px] leading-relaxed text-muted">{g.intro}</p>
        </header>
        {g.blocks.map((b) => (
          <section key={b.h} className="grid gap-2">
            <h2 className="font-display text-xl leading-tight">{b.h}</h2>
            {b.p?.map((p) => <p key={p} className="text-[16px] leading-relaxed">{p}</p>)}
            {b.list && (
              <ul className="grid list-disc gap-1.5 pl-5 text-[16px] leading-relaxed marker:text-accent">
                {b.list.map((li) => <li key={li}>{li}</li>)}
              </ul>
            )}
          </section>
        ))}
      </article>
      <aside className="grid gap-3 rounded-md bg-second-deep p-5 text-on-second">
        <p className="text-[16px] leading-relaxed">{g.cta}</p>
        <Link href="/#try" className="inline-flex min-h-12 w-fit items-center rounded-full bg-accent px-6 font-semibold text-on-accent hover:bg-accent-hover">{s.try}</Link>
      </aside>
      <section aria-labelledby="more-guides" className="grid gap-3">
        <h2 id="more-guides" className="font-display text-xl">{s.more}</h2>
        <ul className="grid gap-2">
          {GUIDE_SLUGS.filter((o) => o !== slug).slice((GUIDE_SLUGS.indexOf(slug)) % 3, ((GUIDE_SLUGS.indexOf(slug)) % 3) + 3).map((o) => (
            <li key={o}><Link href={`/guide/${o}`} className="inline-flex min-h-10 items-center text-[15px] underline underline-offset-4 hover:text-accent">{guideFor(locale, o).title}</Link></li>
          ))}
        </ul>
      </section>
      <nav className="flex flex-wrap gap-4 text-sm"><Link href="/guide" className="inline-flex min-h-10 items-center text-muted underline underline-offset-4 hover:text-ink">← {s.back}</Link></nav>
    </main>
  );
}
