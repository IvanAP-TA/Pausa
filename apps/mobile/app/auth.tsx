// `pausa://auth?code=...`: the app opens here after the person taps the sign-in link in their email (native handshake,
// /api/auth/native/exchange). The one-time code becomes a Bearer token in the keystore, then the app opens on its own.
// On web this route has no meaning and simply goes back to the start.
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { api } from "@/api";
import { privateMetadata } from "@/seo/metadata";
import { setToken } from "@/api/token";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { googleVerifier } from "@/features/google-sign-in";
import { safeNext } from "@/features/next";
import { useTheme } from "@/theme";

export const generateMetadata = () => privateMetadata("Pausa");

export default function NativeAuth() {
  const { code, google, google_error: googleError, locale, next } = useLocalSearchParams<{
    code?: string; google?: string; google_error?: string; locale?: string; next?: string;
  }>();
  const { c } = useTheme();
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const lastCode = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web" || !code) {
      setDone(true);
      return;
    }
    if (lastCode.current === code) return;
    lastCode.current = code;
    setDone(false);
    setFailed(false);
    void (async () => {
      try {
        const verifier = google === "1" ? await googleVerifier() : undefined;
        if (verifier === null) throw new Error("Missing Google sign-in verifier");
        const result = await api.nativeExchange(code, verifier);
        await setToken(result.token);
      } catch {
        setFailed(true);
      } finally {
        setDone(true);
      }
    })();
  }, [code, google]);

  if (!done) return <View style={{ flex: 1, backgroundColor: c.paper }} />;
  const lang = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const target = googleError === "1" || (google === "1" && failed)
    ? `/${lang}/sign-in?google_error=1`
    : safeNext(google === "1" ? next : undefined, `/${lang}/home`);
  return <Redirect href={Platform.OS === "web" ? "/" : (target as never)} />;
}
