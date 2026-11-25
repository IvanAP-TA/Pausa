import { Redirect, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { useState } from "react";
import { Platform, View } from "react-native";
import { api } from "@/api";
import { useAction } from "@/api/useAction";
import { errorMessage } from "@/api/errors";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { space } from "@/theme";
import { Button, Field, Heading, Loading, Notice, Screen, Text } from "@/ui";
import { safeNext } from "./next";
import { openGoogle } from "./google-sign-in";
import { useSession } from "./session";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignIn() {
  const { t, href, locale } = useI18n();
  const { state } = useSession();
  const params = useLocalSearchParams<{ next?: string; google_error?: string }>();
  const next = safeNext(params.next, href("/home"));
  const [email, setEmail] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [googleError, setGoogleError] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const { data: google } = useResource(api.googleStatus, []);
  const send = useAction();

  if (state.status === "loading")
    return (
      <Screen>
        <Loading rows={2} />
      </Screen>
    );
  if (state.status === "ready") return <Redirect href={next as never} />;

  const submit = async () => {
    const value = email.trim();
    if (!EMAIL.test(value)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const res = await send.run(() => api.requestMagicLink({ email: value, next, locale, native: Platform.OS !== "web" }));
    if (res) {
      setSent(true);
      setDevLink(res.value.devLink ?? null);
    }
  };

  const openDev = () => {
    if (!devLink) return;
    if (Platform.OS === "web") window.location.assign(devLink);
    else void Linking.openURL(devLink);
  };

  const startGoogle = async () => {
    setGoogleBusy(true);
    setGoogleError(false);
    try {
      await openGoogle(next, locale);
    } catch {
      setGoogleError(true);
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <Screen width={560}>
      <View style={{ gap: space.md, paddingTop: space.lg }}>
        <Heading level={1}>{t("auth.title")}</Heading>
        <Text variant="lead" tone="ink2">{t("auth.lede")}</Text>
      </View>
      <View style={{ gap: space.md }}>
        <Field
          label={t("auth.email")}
          required
          value={email}
          onChangeText={setEmail}
          placeholder={t("app.signIn.emailPlaceholder")}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          onSubmitEditing={submit}
          error={invalid ? t("app.signIn.invalidEmail") : send.error ? errorMessage(t, send.error) : null}
        />
        <Button label={send.busy ? t("auth.sending") : t("auth.sendLink")} busy={send.busy} onPress={submit} />
        {google?.enabled ? (
          <Button label={t("app.signIn.google")} variant="secondary" busy={googleBusy} onPress={startGoogle} />
        ) : null}
        {googleError || params.google_error === "1" ? <Notice>{t("app.signIn.googleError")}</Notice> : null}
      </View>
      {sent ? (
        <View style={{ gap: space.sm }}>
          <Notice>{t("auth.linkSent")}</Notice>
          {Platform.OS !== "web" ? <Text variant="small" tone="muted">{t("app.signIn.nativeOpen")}</Text> : null}
          {/* Local development only: the API returns `devLink` when it has no mail key and the request is from loopback. */}
          {devLink ? (
            <View style={{ gap: space.xs }}>
              <Button label={t("app.signIn.devLink")} variant="secondary" onPress={openDev} testID="dev-link" />
              <Text variant="small" tone="muted">{t("app.signIn.devHint")}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
