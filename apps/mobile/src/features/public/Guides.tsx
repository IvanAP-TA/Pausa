import { View } from "react-native";
import { useI18n, type Locale } from "@/i18n";
import { GUIDE_SLUGS, publicUrl } from "@/seo/site";
import { JsonLd, ORG_ID, SITE_ID, breadcrumb, orgNode, websiteNode } from "@/seo/jsonld";
import { hair, space, useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Heading, Text } from "@/ui/Text";
import { Anchor } from "./Anchor";
import { Container, PublicPage } from "./PublicPage";

export type Guide = { title: string; description: string; intro: string; blocks: Array<{ h: string; p?: string[]; list?: string[] }>; cta: string };

/** ISO 8601 with offset, as the old pages wrote it (INVENTORY 1.3). */
export const isoDateTime = (day: string) => `${day}T09:00:00+01:00`;

const guideKey = (slug: string) => `guides.items.${slug}`;

export function GuideIndexBody({ locale }: { locale: Locale }) {
  const { t, raw, href } = useI18n();
  const { c } = useTheme();
  const url = publicUrl(locale, "/guide");
  const items = GUIDE_SLUGS.map((slug) => ({ slug, ...raw<Guide>(guideKey(slug)) }));
  return (
    <Container style={{ paddingTop: space.xl, gap: space.lg }}>
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
      <Heading level={1} style={{ maxWidth: 900 }}>{t("guides.indexTitle")}</Heading>
      <Text variant="lead" tone="ink2" style={{ maxWidth: 640 }}>{t("guides.indexLede")}</Text>
      <View role="list" style={{ borderTopWidth: hair, borderColor: c.rule }}>
        {items.map((g) => (
          <View key={g.slug} role="listitem" style={{ borderBottomWidth: hair, borderColor: c.rule, paddingVertical: space.md, gap: space.xs }}>
            <Anchor href={href(`/guide/${g.slug}`)} label={g.title}>
              <Heading level={3}>{g.title}</Heading>
            </Anchor>
            <Text tone="ink2" style={{ maxWidth: 640 }}>{g.description}</Text>
            <Anchor href={href(`/guide/${g.slug}`)} pad>
              <Text variant="strong" tone="accent">{t("guides.read")}</Text>
            </Anchor>
          </View>
        ))}
      </View>
    </Container>
  );
}

export function GuideIndex({ locale }: { locale: Locale }) {
  return (
    <PublicPage locale={locale} sub="/guide">
      <GuideIndexBody locale={locale} />
    </PublicPage>
  );
}

export function GuideBody({ locale, slug }: { locale: Locale; slug: string }) {
  const { t, raw, href } = useI18n();
  const { c } = useTheme();
  const g = raw<Guide>(guideKey(slug));
  const url = publicUrl(locale, `/guide/${slug}`);
  const updated = t("guides.updatedOn");
  return (
    <Container style={{ paddingTop: space.xl, gap: space.lg }}>
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
      <Anchor href={href("/guide")} pad>
        <Text variant="small" tone="muted">{t("guides.back")}</Text>
      </Anchor>
      <Heading level={1} style={{ maxWidth: 900 }}>{g.title}</Heading>
      <Text variant="small" tone="muted">{t("guides.updated")}: {updated}</Text>
      <Text variant="lead" tone="ink2" style={{ maxWidth: 640 }}>{g.intro}</Text>
      {g.blocks.map((b) => (
        <View key={b.h} style={{ borderTopWidth: hair, borderColor: c.rule, paddingTop: space.lg, gap: space.sm }}>
          <Heading level={2}>{b.h}</Heading>
          {b.p?.map((p, i) => <Text key={i} style={{ maxWidth: 680 }}>{p}</Text>)}
          {b.list?.map((li, i) => (
            <View key={i} role="listitem" style={{ flexDirection: "row", gap: space.xs, maxWidth: 680 }}>
              <Text tone="accent">{"•"}</Text>
              <Text style={{ flex: 1 }}>{li}</Text>
            </View>
          ))}
        </View>
      ))}
      <View style={{ borderTopWidth: hair, borderColor: c.rule, paddingTop: space.lg, gap: space.sm }}>
        <Text variant="lead" style={{ maxWidth: 640 }}>{g.cta}</Text>
        <Button label={t("landing.hero.cta")} href={href("/sign-in")} />
      </View>
    </Container>
  );
}

export function GuidePage({ locale, slug }: { locale: Locale; slug: string }) {
  return (
    <PublicPage locale={locale} sub={`/guide/${slug}`}>
      <GuideBody locale={locale} slug={slug} />
    </PublicPage>
  );
}

