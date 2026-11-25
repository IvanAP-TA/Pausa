import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "@/api";

const KEY = "pausa.google-verifier";

export async function openGoogle(next: string, locale: string) {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const verifier = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const challenge = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier);
  await SecureStore.setItemAsync(KEY, verifier);
  const params = new URLSearchParams({ next, locale, native: "1", challenge });
  await Linking.openURL(`${API_URL}/api/auth/google/start?${params}`);
}

export function googleVerifier() {
  return SecureStore.getItemAsync(KEY);
}
