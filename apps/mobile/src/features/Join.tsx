import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { api } from "@/api";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Button, ErrorState, Heading, Loading, Screen, Text } from "@/ui";
import { inviteCodeFrom } from "./next";
import { useSession } from "./session";

/**
 * `/{locale}/join/{code}`, the page an invite link opens. Signed in: the code is used straight away. Not signed in: sign in
 * first and come back here (the sign-in page carries `next`). TODO(server): there is no "peek" endpoint, so this page cannot
 * show the Cerchia's name before joining (the old page did); see the T1b report.
 */
export function Join() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = inviteCodeFrom(String(raw ?? ""));
  const { t, href, locale } = useI18n();
  const { state, reload } = useSession();
  const [result, setResult] = useState<{ circleId: string } | { error: unknown } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (state.status !== "ready" || started.current || code === "") return;
    started.current = true;
    api
      .joinCircle(code)
      .then(async (r) => {
        await reload();
        setResult({ circleId: r.circleId });
      })
      .catch((error) => setResult({ error }));
  }, [state.status, code, reload]);

  if (result && "circleId" in result) return <Redirect href={href(`/c/${result.circleId}`) as never} />;

  if (state.status === "anonymous")
    return (
      <Screen width={560}>
        <Heading level={1}>{t("app.join.title")}</Heading>
        <Text variant="lead" tone="ink2">{t("app.join.body", { code })}</Text>
        <Text tone="ink2">{t("app.join.needSignIn")}</Text>
        <Button label={t("landing.nav.login")} href={`${href("/sign-in")}?next=${encodeURIComponent(`/${locale}/join/${code}`)}`} />
      </Screen>
    );

  return (
    <Screen width={560}>
      <Heading level={1}>{t("app.join.title")}</Heading>
      {result && "error" in result ? (
        <View style={{ gap: space.md }}>
          <ErrorState error={result.error} />
          <Button label={t("errors.home")} variant="secondary" href={href("/home")} />
        </View>
      ) : (
        <Loading rows={2} />
      )}
    </Screen>
  );
}
