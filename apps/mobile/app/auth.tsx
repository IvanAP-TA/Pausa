// `pausa://auth?code=...`: the app opens here after the person taps the sign-in link in their email (native handshake,
// /api/auth/native/exchange). The one-time code becomes a Bearer token in the keystore, then the app opens on its own.
// On web this route has no meaning and simply goes back to the start.
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { api } from "@/api";
import { privateMetadata } from "@/seo/metadata";
import { setToken } from "@/api/token";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { useTheme } from "@/theme";

export const generateMetadata = () => privateMetadata("Pausa");

export default function NativeAuth() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { c } = useTheme();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web" || !code) {
      setDone(true);
      return;
    }
    api
      .nativeExchange(String(code))
      .then((r) => setToken(r.token))
      .catch(() => undefined)
      .finally(() => setDone(true));
  }, [code]);

  if (!done) return <View style={{ flex: 1, backgroundColor: c.paper }} />;
  // The session screen decides what comes next: with a token it shows the Cerchie, without one it goes to sign-in.
  return <Redirect href={Platform.OS === "web" ? "/" : (`/${DEFAULT_LOCALE}/home` as never)} />;
}
