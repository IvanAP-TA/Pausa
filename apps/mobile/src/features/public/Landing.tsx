import type { ReactNode } from "react";
import { View } from "react-native";
import { useI18n, type Locale } from "@/i18n";
import { SITE_URL, publicUrl } from "@/seo/site";
import { JsonLd, orgNode, websiteNode } from "@/seo/jsonld";
import { hair, space, useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Heading, Text, Title } from "@/ui/Text";
import { Container, PublicPage } from "./PublicPage";

type Step = { title: string; body: string };
type Faq = { q: string; a: string };

function Section({ id, children }: { id?: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View nativeID={id} style={{ borderTopWidth: hair, borderColor: c.rule, marginTop: space["2xl"], paddingTop: space.xl }}>
      <Container style={{ gap: space.lg }}>{children}</Container>
    </View>
  );
}

/** One row: a title in display type and the sentence beside or under it. Rows are parted by hairlines, not boxed. */
function Item({ title, body }: Step) {
  const { c } = useTheme();
  return (
    <View style={{ borderBottomWidth: hair, borderColor: c.rule, paddingVertical: space.md, gap: space.xs }}>
      <Heading level={3}>{title}</Heading>
      <Text tone="ink2" style={{ maxWidth: 640 }}>{body}</Text>
    </View>
  );
}

/** The landing's structured data: the four nodes of INVENTORY 1.3 (Organization, WebSite, WebApplication, FAQPage). */
export function landingNodes(locale: Locale, description: string, faq: Faq[]) {
  const url = publicUrl(locale);
  return [
    orgNode(),
    websiteNode(),
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: "Pausa",
      url,
      description,
      applicationCategory: "EntertainmentApplication",
      operatingSystem: "Any",
      inLanguage: ["it", "en", "es"],
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];
}

export function LandingBody({ locale }: { locale: Locale }) {
  const { t, raw, href } = useI18n();
  const steps = raw<Step[]>("landing.how.steps");
  const features = raw<Step[]>("landing.features.items");
  const guestSteps = raw<string[]>("landing.guest.steps");
  const privacy = raw<Step[]>("landing.privacy.items");
  const faq = raw<Faq[]>("landing.faq.items");
  return (
    <>
      <JsonLd nodes={landingNodes(locale, t("landing.meta.description"), faq)} />
      <Container style={{ paddingTop: space["2xl"], gap: space.lg }}>
        <Heading level={1} hero>{t("landing.hero.title")}</Heading>
        <Text variant="lead" tone="ink2" style={{ maxWidth: 620 }}>{t("landing.hero.lede")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <Button label={t("landing.hero.cta")} href={href("/sign-in")} />
          <Button label={t("landing.footer.guides")} href={href("/guide")} variant="secondary" />
        </View>
        <Text variant="small" tone="muted" style={{ maxWidth: 560 }}>{t("landing.hero.note")}</Text>
      </Container>

      <Section>
        <Heading level={2} style={{ maxWidth: 900 }}>{t("landing.problem.title")}</Heading>
        <Text variant="lead" tone="ink2" style={{ maxWidth: 640 }}>{t("landing.problem.body")}</Text>
      </Section>

      <Section id="how">
        <Heading level={2}>{t("landing.how.title")}</Heading>
        <View>{steps.map((s, i) => <Item key={i} title={`${i + 1}. ${s.title}`} body={s.body} />)}</View>
      </Section>

      <Section>
        <Heading level={2} style={{ maxWidth: 900 }}>{t("landing.features.title")}</Heading>
        <View>{features.map((f, i) => <Item key={i} {...f} />)}</View>
      </Section>

      <Section>
        <Heading level={2}>{t("landing.guest.title")}</Heading>
        <Text tone="ink2" style={{ maxWidth: 640 }}>{t("landing.guest.body")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
          {guestSteps.map((s, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs }}>
              <Title tone="accent">{i + 1}</Title>
              <Text tone="ink2">{s}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section id="privacy">
        <Heading level={2}>{t("landing.privacy.title")}</Heading>
        <View>{privacy.map((p, i) => <Item key={i} {...p} />)}</View>
      </Section>

      <Section id="faq">
        <Heading level={2}>{t("landing.faq.title")}</Heading>
        <View>
          {faq.map((f, i) => (
            <View key={i} style={{ paddingVertical: space.md, gap: space.xs }}>
              <Heading level={3}>{f.q}</Heading>
              <Text tone="ink2" style={{ maxWidth: 640 }}>{f.a}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section>
        <Heading level={2}>{t("landing.final.title")}</Heading>
        <Text variant="lead" tone="ink2" style={{ maxWidth: 560 }}>{t("landing.final.body")}</Text>
        <Button label={t("landing.hero.cta")} href={href("/sign-in")} />
      </Section>
    </>
  );
}

export function Landing({ locale }: { locale: Locale }) {
  return (
    <PublicPage locale={locale}>
      <LandingBody locale={locale} />
    </PublicPage>
  );
}
