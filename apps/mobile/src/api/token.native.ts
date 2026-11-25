// Android / iOS: the Bearer token lives in the platform keystore (expo-secure-store: Keychain / Keystore).
import * as SecureStore from "expo-secure-store";

const KEY = "pausa.session";
let memory: string | null | undefined;

export async function getToken(): Promise<string | null> {
  if (memory !== undefined) return memory;
  memory = await SecureStore.getItemAsync(KEY);
  return memory;
}

export async function setToken(token: string | null): Promise<void> {
  memory = token;
  if (token) await SecureStore.setItemAsync(KEY, token);
  else await SecureStore.deleteItemAsync(KEY);
}
