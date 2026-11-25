import { View } from "react-native";
import { useI18n, type Locale } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { Heading, Text } from "@/ui/Text";
import { Anchor } from "./Anchor";
import { Container, PublicPage } from "./PublicPage";
import { legalContact } from "./legal-contact";

type Doc = { title: string; updated: string; intro: string; sections: Array<{ h: string; p: string[] }> };

export function LegalBody({ kind }: { kind: "privacy" | "terms" }) {
  const { raw, t } = useI18n();
  const { c } = useTheme();
  const doc = raw<Doc>(`legal.${kind}`);
  const { entity, email } = legalContact();
  return (
    <Container style={{ paddingTop: space.xl, gap: space.lg }}>
      <Heading level={1} style={{ maxWidth: 900 }}>{doc.title}</Heading>
      <Text variant="small" tone="muted">{doc.updated}: {t("legal.updatedOn")}</Text>
      <Text variant="lead" tone="ink2" style={{ maxWidth: 640 }}>{doc.intro}</Text>
      {doc.sections.map((s) => (
        <View key={s.h} style={{ borderTopWidth: hair, borderColor: c.rule, paddingTop: space.lg, gap: space.sm }}>
          <Heading level={2}>{s.h}</Heading>
          {s.p.map((p, i) => (
            <Text key={i} tone="ink" style={{ maxWidth: 680 }}>{p}</Text>
          ))}
        </View>
      ))}
      {/* Controller and contact: from LEGAL_ENTITY / CONTACT_EMAIL at build time. Until they are set the page SAYS so, visibly. */}
      <View nativeID="controller" style={{ borderTopWidth: hair, borderColor: c.rule, paddingTop: space.lg, gap: space["2xs"] }}>
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
    <PublicPage locale={locale} sub={`/${kind}`}>
      <LegalBody kind={kind} />
    </PublicPage>
  );
}
