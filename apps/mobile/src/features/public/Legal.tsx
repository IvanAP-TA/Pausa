import { View } from "react-native";
import { useI18n, type Locale } from "@/i18n";
import { space } from "@/theme";
import { Heading, Text, Title } from "@/ui/Text";
import { Anchor } from "./Anchor";
import { Container, PublicPage } from "./PublicPage";
import { Plate } from "./Plate";
import { legalContact } from "./legal-contact";

type Doc = { title: string; updated: string; intro: string; sections: Array<{ h: string; p: string[] }> };

export function LegalBody({ kind }: { kind: "privacy" | "terms" }) {
  const { raw, t, href } = useI18n();
  const doc = raw<Doc>(`legal.${kind}`);
  const { entity, email } = legalContact();
  return (
    <Container max={1152} style={{ paddingTop: space.md, paddingBottom: space["2xl"], gap: space.xl }}>
      {/* No site header or footer on the legal pages (as in the old app): only the brand link. */}
      <View style={{ alignSelf: "flex-start" }}>
        <Anchor href={href()} label={t("app.nav.home")} pad>
          <Title style={{ fontSize: 28, lineHeight: 34 }}>Pausa</Title>
        </Anchor>
      </View>
      <View style={{ gap: space.sm }}>
        <Heading level={1} style={{ maxWidth: 900 }}>{doc.title}</Heading>
        <Text variant="small" tone="muted">{doc.updated}: {t("legal.updatedOn")}</Text>
        <Text variant="lead" tone="ink2" style={{ maxWidth: 640 }}>{doc.intro}</Text>
      </View>
      {doc.sections.map((s) => (
        <Plate key={s.h} title={s.h}>
          {s.p.map((p, i) => (
            <Text key={i}>{p}</Text>
          ))}
        </Plate>
      ))}
      {/* Controller and contact: from LEGAL_ENTITY / CONTACT_EMAIL at build time. Until they are set the page SAYS so, visibly. */}
      <View nativeID="controller" style={{ gap: space["2xs"] }}>
        <Text variant="small" tone="muted">{t("app.legal.entityLabel")}</Text>
        <Text tone={entity ? "ink" : "error"}>{entity ?? t("app.legal.entityPlaceholder")}</Text>
        <Text variant="small" tone="muted" style={{ marginTop: space.xs }}>{t("app.legal.contactLabel")}</Text>
        {email ? (
          <Anchor href={`mailto:${email}`} pad>
            <Text tone="ink">{email}</Text>
          </Anchor>
        ) : (
          <Text tone="error">{t("app.legal.contactPlaceholder")}</Text>
        )}
      </View>
    </Container>
  );
}

export function Legal({ locale, kind }: { locale: Locale; kind: "privacy" | "terms" }) {
  return (
    <PublicPage locale={locale} sub={`/${kind}`} bare>
      <LegalBody kind={kind} />
    </PublicPage>
  );
}
