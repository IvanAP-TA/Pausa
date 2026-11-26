import { View } from "react-native";
import { useI18n, type Locale } from "@/i18n";
import { GUIDE_SLUGS, publicUrl } from "@/seo/site";
import { JsonLd, ORG_ID, SITE_ID, breadcrumb, orgNode, websiteNode } from "@/seo/jsonld";
import { hair, space, useTheme, web } from "@/theme";
import { Button } from "@/ui/Button";
import { Well } from "@/ui/Surfaces";
import { Heading, Text, Title } from "@/ui/Text";
import { Anchor } from "./Anchor";
import { Container, PublicPage } from "./PublicPage";
import { Plate } from "./Plate";

export type Guide = { title: string; description: string; intro: string; blocks: Array<{ h: string; p?: string[]; list?: string[] }>; cta: string };

/** ISO 8601 with offset, as the old pages wrote it (INVENTORY 1.3). */
export const isoDateTime = (day: string) => `${day}T09:00:00+01:00`;

const guideKey = (slug: string) => `guides.items.${slug}`;

/** Brand link (and, on a guide, the index) on top of the page: guides carry no site header, as in the old app. */
function Crumbs({ withIndex }: { withIndex?: boolean }) {
  const { t, href } = useI18n();
  return (
    <View role="navigation" aria-label={t("guides.breadcrumb")} style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: space.xs }}>
      <Anchor href={href()} label={t("app.nav.home")} pad>
        <Title style={{ fontSize: 28, lineHeight: 34 }}>Pausa</Title>
      </Anchor>
      {withIndex ? (
        <>
          <Text tone="muted" aria-hidden>{"/"}</Text>
          <Anchor href={href("/guide")} pad>
            <Text variant="small" tone="ink">{t("guides.index")}</Text>
          </Anchor>
        </>
      ) : null}
    </View>
  );
}

export function GuideIndexBody({ locale }: { locale: Locale }) {
  const { t, raw, href } = useI18n();
  const { c } = useTheme();
  const url = publicUrl(locale, "/guide");
  const items = GUIDE_SLUGS.map((slug) => ({ slug, ...raw<Guide>(guideKey(slug)) }));
  return (
    <Container max={1152} style={{ paddingTop: space.md, paddingBottom: space["2xl"], gap: space.xl }}>
      <JsonLd
        nodes={[
          orgNode(),
          websiteNode(),
          {
            "@type": "CollectionPage",
            "@id": url,
            url,
            name: t("guides.indexTitle"),
            description: t("guides.indexLede"),
            inLanguage: locale,
            isPartOf: { "@id": SITE_ID },
            mainEntity: {
              "@type": "ItemList",
              itemListElement: items.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: `${url}/${g.slug}`, name: g.title })),
            },
          },
          breadcrumb([
            { name: "Pausa", url: publicUrl(locale) },
            { name: t("guides.index"), url },
          ]),
        ]}
      />
      <Crumbs />
      <View style={{ gap: space.sm }}>
        <Heading level={1} style={{ maxWidth: 900 }}>{t("guides.indexTitle")}</Heading>
        <Text variant="lead" tone="ink2" style={{ maxWidth: 640 }}>{t("guides.indexLede")}</Text>
      </View>
      {/* A sheet of rows: title in capitals, summary beside it, link at the end; they wrap under each other on a phone (no media query). */}
      <View role="list" style={{ borderTopWidth: hair, borderColor: c.rule }}>
        {items.map((g) => (
          <View
            key={g.slug}
            role="listitem"
            style={[{ borderBottomWidth: hair, borderColor: c.rule, paddingVertical: space.md, gap: space.xs }, web({ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 32 })]}
          >
            <View style={web({ flex: "5 1 18rem", minWidth: 0 })}>
              <Anchor href={href(`/guide/${g.slug}`)} label={g.title}>
                <Heading level={3}>{g.title}</Heading>
              </Anchor>
            </View>
            <Text tone="ink2" style={[{ maxWidth: 640 }, web({ flex: "6 1 18rem", minWidth: 0 })]}>{g.description}</Text>
            <Anchor href={href(`/guide/${g.slug}`)} label={`${t("guides.read")}: ${g.title}`} pad>
              <Text variant="strong" tone="accent" style={{ textDecorationLine: "underline" }}>{t("guides.read")}</Text>
            </Anchor>
          </View>
        ))}
      </View>
    </Container>
  );
}

export function GuideIndex({ locale }: { locale: Locale }) {
  return (
    <PublicPage locale={locale} sub="/guide" bare>
      <GuideIndexBody locale={locale} />
    </PublicPage>
  );
}

/** The old app's pick: up to three of the other guides, starting at (index mod 3). */
const moreGuides = (slug: string) => {
  const i = GUIDE_SLUGS.indexOf(slug);
  return GUIDE_SLUGS.filter((o) => o !== slug).slice(i % 3, (i % 3) + 3);
};

export function GuideBody({ locale, slug }: { locale: Locale; slug: string }) {
  const { t, raw, href } = useI18n();
  const { c } = useTheme();
  const g = raw<Guide>(guideKey(slug));
  const url = publicUrl(locale, `/guide/${slug}`);
  const updated = t("guides.updatedOn");
  const more = moreGuides(slug).map((o) => ({ slug: o, title: raw<Guide>(guideKey(o)).title }));
  return (
    <Container max={1152} style={{ paddingTop: space.md, paddingBottom: space["2xl"], gap: space.xl }}>
      <JsonLd
        nodes={[
          orgNode(),
          websiteNode(),
          {
            "@type": "Article",
            headline: g.title,
            description: g.description,
            inLanguage: locale,
            datePublished: isoDateTime(updated),
            dateModified: isoDateTime(updated),
            mainEntityOfPage: { "@type": "WebPage", "@id": url, isPartOf: { "@id": SITE_ID } },
            author: { "@id": ORG_ID },
            publisher: { "@id": ORG_ID },
          },
          breadcrumb([
            { name: "Pausa", url: publicUrl(locale) },
            { name: t("guides.index"), url: publicUrl(locale, "/guide") },
            { name: g.title, url },
          ]),
        ]}
      />
      <Crumbs withIndex />
      <View style={{ gap: space.sm }}>
        <Heading level={1} style={{ maxWidth: 900 }}>{g.title}</Heading>
        <Text variant="small" tone="muted">{t("guides.updated")}: {updated}</Text>
        <Text variant="lead" tone="ink2" style={{ maxWidth: 640 }}>{g.intro}</Text>
      </View>
      {g.blocks.map((b) => (
        <Plate key={b.h} title={b.h}>
          {b.p?.map((p, i) => <Text key={i}>{p}</Text>)}
          {b.list ? (
            <View role="list" style={{ gap: space.xs }}>
              {b.list.map((li, i) => (
                <View key={i} role="listitem" style={{ flexDirection: "row", gap: space.xs }}>
                  <Text tone="muted" aria-hidden>{"•"}</Text>
                  <Text style={{ flex: 1 }}>{li}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Plate>
      ))}
      <Well grained style={{ padding: space.lg, gap: space.md, alignItems: "flex-start" }}>
        <Text variant="lead" style={{ maxWidth: 640 }}>{g.cta}</Text>
        <Button label={t("guides.try")} href={`${href()}#try`} size="lg" />
      </Well>
      {more.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Heading level={2}>{t("guides.more")}</Heading>
          <View role="list" style={{ borderTopWidth: hair, borderColor: c.rule }}>
            {more.map((o) => (
              <View key={o.slug} role="listitem" style={{ borderBottomWidth: hair, borderColor: c.rule }}>
                <Anchor href={href(`/guide/${o.slug}`)} pad>
                  <Heading level={3}>{o.title}</Heading>
                </Anchor>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <Anchor href={href("/guide")} pad>
        <Text variant="small" tone="ink" style={{ textDecorationLine: "underline" }}>{t("guides.back")}</Text>
      </Anchor>
    </Container>
  );
}

export function GuidePage({ locale, slug }: { locale: Locale; slug: string }) {
  return (
    <PublicPage locale={locale} sub={`/guide/${slug}`} bare>
      <GuideBody locale={locale} slug={slug} />
    </PublicPage>
  );
}
