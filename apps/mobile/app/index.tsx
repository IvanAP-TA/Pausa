// `/`: in production nobody sees this page, the Worker redirects to the landing in the browser's language (crates/api,
// `serve_client`). The static file stays as the fallback of a plain file server, with the root's metadata. No JavaScript.
import type { GenerateMetadataFunction } from "expo-server";
import { Redirect } from "expo-router";
import { Platform, View } from "react-native";
import { publicI18n } from "@/i18n/public";
import { LOCALES, isLocale, type Locale } from "@/i18n";
import { SHARE_IMAGE, THEME_COLOR } from "@/seo/metadata";
import { DEFAULT_LOCALE, SITE_URL, publicUrl } from "@/seo/site";
import { hair, space, useTheme } from "@/theme";
import { Anchor } from "@/features/public/Anchor";
import { Container } from "@/features/public/PublicPage";
import { Heading, Text } from "@/ui/Text";

export const generateMetadata: GenerateMetadataFunction = () => {
  const i18n = publicI18n(DEFAULT_LOCALE);
  const description = i18n.t("landing.meta.siteDescription");
  return {
    title: "Pausa",
    description,
    robots: { index: true, follow: true },
    alternates: {
      canonical: `${SITE_URL}/`,
      languages: { ...Object.fromEntries(LOCALES.map((l) => [l, publicUrl(l)])), "x-default": `${SITE_URL}/` },
    },
    openGraph: { type: "website", title: "Pausa", description, url: `${SITE_URL}/`, siteName: "Pausa", images: [SHARE_IMAGE] },
    twitter: { card: "summary", title: "Pausa", description, images: [{ url: SHARE_IMAGE.url, alt: SHARE_IMAGE.alt }] },
    other: { "theme-color": THEME_COLOR },
    icons: { icon: "/favicon.ico" },
  };
};

/** The app (not the website) opens straight into the signed-in area, in the device language when we have it. */
function deviceLocale(): Locale {
  const tag = (Intl.DateTimeFormat().resolvedOptions().locale ?? "").slice(0, 2);
  return isLocale(tag) ? tag : DEFAULT_LOCALE;
}

export default function Chooser() {
  const { c } = useTheme();
  if (Platform.OS !== "web") return <Redirect href={`/${deviceLocale()}/home` as never} />;
  return (
    <View role="main" style={{ flex: 1, backgroundColor: c.paper, justifyContent: "center" }}>
      <Container max={720} style={{ paddingVertical: space["2xl"], gap: space.lg }}>
        <Heading level={1} hero>Pausa</Heading>
        <View role="list" style={{ borderTopWidth: hair, borderColor: c.rule }}>
          {(LOCALES as readonly Locale[]).map((l) => {
            const i18n = publicI18n(l);
            return (
              <View key={l} role="listitem" style={{ borderBottomWidth: hair, borderColor: c.rule }}>
                <Anchor href={`/${l}`} lang={l} pad>
                  <View style={{ gap: space["2xs"], paddingVertical: space.xs }}>
                    <Heading level={3}>{i18n.t(`app.languages.${l}`)}</Heading>
                    <Text tone="ink2" {...({ lang: l } as object)}>{i18n.t("app.root.lede")}</Text>
                  </View>
                </Anchor>
              </View>
            );
          })}
        </View>
      </Container>
    </View>
  );
}
