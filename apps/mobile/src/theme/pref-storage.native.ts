// Android / iOS: the theme choice goes in the keystore store too (small, and it avoids another native module).
import * as SecureStore from "expo-secure-store";

export async function readStored(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function writeStored(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // keep the choice for this session only
  }
}
