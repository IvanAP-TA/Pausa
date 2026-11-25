// Frame of every statically rendered page (landing, guides, legal, 404): no state, no effects, no Reanimated, so the exported HTML is
// complete and the page needs no JavaScript. Language switching, navigation and the skip link are plain links.
import { createElement, type ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import "@/i18n/public";
import { I18nProvider, LOCALES, useI18n, type Locale } from "@/i18n";
import { hair, space, useTheme, web } from "@/theme";
import { Anchor } from "./Anchor";
import { Text, Title } from "@/ui/Text";

/** Horizontal padding: 16dp on a phone, growing to 64 on wide screens, in one CSS clamp (no media queries needed). */
export const gutter: ViewStyle = { paddingHorizontal: 16, ...web({ paddingHorizontal: "clamp(16px, 5vw, 64px)" }) };

export function Container({ children, style, max = 1100 }: { children: ReactNode; style?: ViewStyle; max?: number }) {
  return <View style={[{ width: "100%", maxWidth: max, alignSelf: "center" }, gutter, style]}>{children}</View>;
}

function SkipLink() {
  const { t } = useI18n();
  // `createElement("a")` is web-only on purpose: public pages exist for crawlers and browsers, never inside the native shell.
  return createElement("a", { className: "skip-link", href: "#main" }, t("app.skip"));
}

function Header() {
  const { t, href, locale } = useI18n();
  const { c } = useTheme();
  return (
    <View role="banner" style={{ borderBottomWidth: hair, borderColor: c.rule }}>
      <Container style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", paddingVertical: space.xs, gap: space.sm }}>
        <Anchor href={href()} label={t("app.nav.home")}>
          <Title style={{ fontSize: 28, lineHeight: 34 }}>Pausa</Title>
        </Anchor>
        <View role="navigation" aria-label={t("landing.nav.menu")} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
          <Anchor href={href("/guide")} pad>
            <Text variant="small" tone="ink2">{t("landing.footer.guides")}</Text>
          </Anchor>
          <LanguageLinks current={locale} />
          <Anchor href={href("/sign-in")} pad>
            <Text variant="strong" tone="accent">{t("landing.nav.login")}</Text>
          </Anchor>
        </View>
      </Container>
    </View>
  );
}

/** Three links, one per language, each in its own language (hreflang tells crawlers they are the same page). */
export function LanguageLinks({ current, sub = "" }: { current: Locale; sub?: string }) {
  const { t } = useI18n();
  return (
    <View role="list" aria-label={t("landing.nav.language")} style={{ flexDirection: "row", alignItems: "center" }}>
      {LOCALES.map((l) => (
        <View key={l} role="listitem">
          <Anchor href={`/${l}${sub}`} pad lang={l} current={l === current}>
            <Text variant="small" tone={l === current ? "ink" : "muted"} style={l === current ? { textDecorationLine: "underline" } : undefined}>
              {l.toUpperCase()}
            </Text>
          </Anchor>
        </View>
      ))}
    </View>
  );
}

function Footer({ sub }: { sub: string }) {
  const { t, href, locale } = useI18n();
  const { c } = useTheme();
  return (
    <View role="contentinfo" style={{ borderTopWidth: hair, borderColor: c.rule, marginTop: space["2xl"] }}>
      <Container style={{ paddingVertical: space.lg, gap: space.sm }}>
        <Text tone="ink2">{t("landing.footer.tagline")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.md }}>
          <Anchor href={href("/guide")} pad><Text variant="small">{t("landing.footer.guides")}</Text></Anchor>
          <Anchor href={href("/privacy")} pad><Text variant="small">{t("landing.footer.privacy")}</Text></Anchor>
          <Anchor href={href("/terms")} pad><Text variant="small">{t("landing.footer.terms")}</Text></Anchor>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }}>
          <Text variant="small" tone="muted">{t("landing.footer.language")}:</Text>
          <LanguageLinks current={locale} sub={sub} />
        </View>
        <Text variant="small" tone="muted">{t("tmdb.attribution")}</Text>
      </Container>
    </View>
  );
}

/**
 * `sub` is the path under /{locale} this page lives at, so the language links in the footer lead to the same page in the
 * other languages.
 */
export function PublicPage({ locale, sub = "", children }: { locale: Locale; sub?: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <I18nProvider locale={locale}>
      <View
        style={[
          { flex: 1, backgroundColor: c.paper },
          // The safelight: one soft light falling on the top of the screen (DESIGN.md Surfaces). Web only, CSS gradient.
          web({ backgroundImage: "radial-gradient(ellipse 90% 420px at 50% 0, color-mix(in oklab, var(--c-accent) 14%, transparent), transparent)", backgroundRepeat: "no-repeat" }),
        ]}
      >
        <SkipLink />
        <Header />
        <View role="main" nativeID="main" style={{ flex: 1 }}>
          {children}
        </View>
        <Footer sub={sub} />
      </View>
    </I18nProvider>
  );
}
