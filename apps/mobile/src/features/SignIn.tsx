import { Redirect, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { useState } from "react";
import { Platform, useWindowDimensions, View } from "react-native";
import { API_URL, api } from "@/api";
import { useAction } from "@/api/useAction";
import { errorMessage } from "@/api/errors";
import { useResource } from "@/api/useResource";
import { useI18n } from "@/i18n";
import { breakpoints, hair, space, useTheme } from "@/theme";
import { Button, Field, Heading, Loading, Notice, Screen, Text } from "@/ui";
import { Wordmark } from "@/ui/Brand";
import { GoogleMark } from "@/ui/GoogleMark";
import { Well } from "@/ui/Surfaces";
import { isEmbeddedBrowser, isNativeShell, nativeDoneUrl } from "./embedded-browser";
import { safeNext } from "./next";
import { openGoogle } from "./google-sign-in";
import { useSession } from "./session";
import "./signin-errors.messages";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignIn() {
  const { t, href, locale } = useI18n();
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const { state } = useSession();
  const params = useLocalSearchParams<{ next?: string; google_error?: string; signin_error?: string }>();
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

  const wide = width >= breakpoints.rail;
  // In-app browsers (WhatsApp, Instagram...) refuse Google: web only. The first paint has no user agent on the server, so a
  // visitor in one sees the button flash at most once; the e2e cannot have it (Playwright is a real browser).
  // v1's Tauri app is a WebView too, but it sends Google to the system browser and takes the session back: the button stays.
  const shell = Platform.OS === "web" && isNativeShell();
  const embedded = !shell && Platform.OS === "web" && typeof navigator !== "undefined" && isEmbeddedBrowser(navigator.userAgent);
  const googleOn = google?.enabled === true;

  const submit = async () => {
    const value = email.trim();
    if (!EMAIL.test(value)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const res = await send.run(() => api.requestMagicLink({ email: value, next: shell ? nativeDoneUrl(next) : next, locale, native: Platform.OS !== "web" }));
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
    if (shell) {
      // The shell catches this address and opens it in the system browser (legacy google-button.tsx).
      window.location.href = `${API_URL}/api/native/start?next=${encodeURIComponent(next)}`;
      return;
    }
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

  // Once the link is sent, the form gives way to the message (legacy sign-in-form.tsx:30-32).
  const form = sent ? (
    <View style={{ gap: space.sm }}>
      <Notice>{t("auth.linkSent")}</Notice>
      {Platform.OS !== "web" || shell ? <Text variant="small" tone="muted">{t("app.signIn.nativeOpen")}</Text> : null}
      {/* Local development only: the API returns `devLink` when it has no mail key and the request is from loopback. */}
      {devLink ? (
        <View style={{ gap: space.xs }}>
          <Button label={t("app.signIn.devLink")} variant="secondary" onPress={openDev} testID="dev-link" />
          <Text variant="small" tone="muted">{t("app.signIn.devHint")}</Text>
        </View>
      ) : null}
    </View>
  ) : (
    <View style={{ gap: space.md }}>
      {googleOn && embedded ? <Text variant="small" tone="ink2">{t("auth.embeddedHint")}</Text> : null}
      {googleError || params.google_error === "1" ? <Notice tone="ink2">{t("app.signIn.googleError")}</Notice> : null}
      {params.signin_error === "link" || params.signin_error === "disabled" ? (
        <View testID="signin-error">
          <Notice tone="ink2">{t(params.signin_error === "link" ? "signinError.link" : "signinError.disabled")}</Notice>
        </View>
      ) : null}
      {googleOn && !embedded ? (
        <>
          <Button label={t("auth.google")} variant="secondary" icon={GoogleMark} busy={googleBusy} onPress={startGoogle} fullWidth />
          <View aria-hidden style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View style={{ flex: 1, height: hair, backgroundColor: c.rule }} />
            <Text variant="small" tone="muted">{t("auth.or")}</Text>
            <View style={{ flex: 1, height: hair, backgroundColor: c.rule }} />
          </View>
        </>
      ) : null}
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
      <Button label={send.busy ? t("auth.sending") : t("auth.sendLink")} busy={send.busy} onPress={submit} fullWidth />
    </View>
  );

  // The sheet: the head on the left, the form on a grained well on the right; one column on a phone. The TMDB credit is required
  // wherever TMDB data is shown, and legacy prints it on this page too.
  return (
    <Screen width={1152}>
      <Wordmark size={36} />
      <View style={{ flexDirection: wide ? "row" : "column", alignItems: wide ? "center" : "stretch", gap: wide ? space["2xl"] : space.lg, paddingVertical: wide ? space.xl : 0 }}>
        <View style={{ flex: wide ? 1 : undefined, gap: space.md, minWidth: 0 }}>
          <Heading level={1}>{t("auth.title")}</Heading>
          <Text variant="lead" tone="ink2" style={{ maxWidth: 520 }}>{t("auth.lede")}</Text>
        </View>
        <Well grained style={{ padding: wide ? space.xl : space.md, width: wide ? 416 : "100%" }}>
          {form}
        </Well>
      </View>
      <View style={{ borderTopWidth: hair, borderColor: c.rule, paddingTop: space.md, maxWidth: 650 }}>
        <Text variant="small" tone="muted">{t("tmdb.attribution")}</Text>
      </View>
    </Screen>
  );
}
