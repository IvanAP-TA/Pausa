import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import type { Picked } from "./parsers/read";

/**
 * Android / iOS: the system file picker, any type (Android filters by MIME type, not extension, and an export may be offered under
 * several: the parsers say "this is not the right file" themselves). Chosen files are copied to the cache and read as bytes.
 */
export async function pickFiles(_accept: string[], multiple: boolean): Promise<Picked[]> {
  const res = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple, copyToCacheDirectory: true });
  if (res.canceled || !res.assets) return [];
  return Promise.all(res.assets.map(async (a) => ({ name: a.name, bytes: new Uint8Array(await new File(a.uri).arrayBuffer()) })));
}
