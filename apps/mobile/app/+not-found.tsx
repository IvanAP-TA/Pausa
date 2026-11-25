// 404: exported as +not-found.html and renamed 404.html by postexport. The URL is unknown, so the language is too: the message
// is shown in all three, and there is no JavaScript to pick one.
import { View } from "react-native";
import { publicI18n } from "@/i18n/public";
import { LOCALES, type Locale } from "@/i18n";
import { hair, space, useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Heading, Text } from "@/ui/Text";
import { Container } from "@/features/public/PublicPage";

// NOTE: expo-router ignores generateMetadata on +not-found (measured: no <title>, no robots). scripts/postexport.mjs writes the
// <title> and noindex into 404.html instead, and fails the build if they are missing.

export default function NotFound() {
  const { c } = useTheme();
  return (
    <View role="main" style={{ flex: 1, backgroundColor: c.paper, justifyContent: "center" }}>
      <Container max={720} style={{ paddingVertical: space["2xl"], gap: space.xl }}>
        {(LOCALES as readonly Locale[]).map((l, i) => {
          const i18n = publicI18n(l);
          return (
            <View key={l} style={{ gap: space.sm, borderTopWidth: i === 0 ? 0 : hair, borderColor: c.rule, paddingTop: i === 0 ? 0 : space.lg }}>
              {i === 0 ? <Heading level={1}>{i18n.t("errors.notFoundTitle")}</Heading> : <Heading level={2}>{i18n.t("errors.notFoundTitle")}</Heading>}
              <Text tone="ink2" {...({ lang: l } as object)}>{i18n.t("errors.notFoundBody")}</Text>
              <Button label={i18n.t("errors.home")} href={`/${l}`} variant={i === 0 ? "primary" : "secondary"} />
            </View>
          );
        })}
      </Container>
    </View>
  );
}
