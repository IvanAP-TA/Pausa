// Android / iOS: the Bearer token lives in the platform keystore (expo-secure-store: Keychain / Keystore).
import * as SecureStore from "expo-secure-store";

const KEY = "pausa.session";
let memory: string | null | undefined;
const signInListeners = new Set<() => void>();

export function onNativeSignIn(listener: () => void): () => void {
  signInListeners.add(listener);
  return () => { signInListeners.delete(listener); };
}

export async function getToken(): Promise<string | null> {
  if (memory !== undefined) return memory;
  memory = await SecureStore.getItemAsync(KEY);
  return memory;
}

export async function setToken(token: string | null): Promise<void> {
  memory = token;
  if (token) {
    await SecureStore.setItemAsync(KEY, token);
    signInListeners.forEach((listener) => listener());
  } else await SecureStore.deleteItemAsync(KEY);
}
