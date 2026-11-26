// The quiet pages of legacy (error.tsx, slow-down/page.tsx): the wordmark, a poster title, one sentence, one button. "slow" is
// static (exported with no JavaScript, noindex); "error" is the in-app error boundary, shown when a screen throws.
import { View } from "react-native";
import "@/i18n/public";
import { I18nProvider, useI18n, type Locale } from "@/i18n";
import { space, useTheme } from "@/theme";
import { Anchor } from "./Anchor";
import { Container } from "./PublicPage";
import { Button } from "@/ui/Button";
import { Wordmark } from "@/ui/Brand";
import { Heading, Text } from "@/ui/Text";

function Body({ kind, onRetry }: { kind: "slow" | "error"; onRetry?: () => void }) {
  const { t, href } = useI18n();
  const { c } = useTheme();
  return (
    <View role="main" style={{ flex: 1, backgroundColor: c.paper }}>
      <Container max={640} style={{ paddingVertical: space.lg, flex: 1, gap: space.lg }}>
        <Anchor href={href()} label={t("app.nav.home")}>
          <Wordmark size={36} />
        </Anchor>
        <View style={{ flex: 1, justifyContent: "center", gap: space.md, paddingVertical: space.xl }}>
          <Heading level={1}>{kind === "slow" ? t("errors.slowTitle") : t("errors.errorTitle")}</Heading>
          <Text variant="lead" tone="ink2" style={{ maxWidth: 520 }}>{kind === "slow" ? t("errors.slowBody") : t("errors.errorBody")}</Text>
          <View style={{ marginTop: space.sm }}>
            {kind === "error" && onRetry ? (
              <Button label={t("errors.retry")} size="lg" onPress={onRetry} />
            ) : (
              <Button label={t("errors.home")} size="lg" href={href()} />
            )}
          </View>
        </View>
      </Container>
    </View>
  );
}

export function ErrorPage({ locale, kind, onRetry, deferred }: { locale: Locale; kind: "slow" | "error"; onRetry?: () => void; deferred?: boolean }) {
  return (
    <I18nProvider locale={locale} deferred={deferred} fallback={null}>
      <Body kind={kind} onRetry={onRetry} />
    </I18nProvider>
  );
}
