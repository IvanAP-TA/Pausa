// 404: exported as +not-found.html, but scripts/postexport.mjs replaces it with a static 404.html per language (the asset host
// serves the nearest one up the path). This screen is the in-app 404, shown by the client router after JavaScript runs: it
// speaks only the language of the address (the default one when the address has none).
import { View } from "react-native";
import { usePathname } from "expo-router";
import { publicI18n } from "@/i18n/public";
import { LOCALES, type Locale } from "@/i18n";
import { space, useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Heading, Text } from "@/ui/Text";
import { Container } from "@/features/public/PublicPage";

// NOTE: expo-router ignores generateMetadata on +not-found (measured: no <title>, no robots). scripts/postexport.mjs writes the
// <title> and noindex into the 404 files instead, and fails the build if they are missing.

function localeOfPath(pathname: string | null | undefined): Locale {
  const first = (pathname ?? "").split("/").filter(Boolean)[0];
  return (LOCALES as readonly string[]).includes(first ?? "") ? (first as Locale) : "it";
}

export default function NotFound() {
  const { c } = useTheme();
  const l = localeOfPath(usePathname());
  const i18n = publicI18n(l);
  return (
    <View role="main" style={{ flex: 1, backgroundColor: c.paper, justifyContent: "center" }}>
      <Container max={720} style={{ paddingVertical: space["2xl"], gap: space.xl }}>
        <View style={{ gap: space.sm }} {...({ lang: l } as object)}>
          <Heading level={1}>{i18n.t("errors.notFoundTitle")}</Heading>
          <Text tone="ink2">{i18n.t("errors.notFoundBody")}</Text>
          <Button label={i18n.t("errors.home")} href={`/${l}`} variant="primary" />
        </View>
      </Container>
    </View>
  );
}
