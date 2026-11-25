import * as DocumentPicker from "expo-document-picker";
import type { Picked } from "./parsers/read";

/**
 * Web: the picker is a file input the library creates and opens; each asset carries the browser's `File`, read as bytes here.
 * Returns [] when the person cancels. (`accept` is a list of extensions and MIME types, as for an input.)
 */
export async function pickFiles(accept: string[], multiple: boolean): Promise<Picked[]> {
  const res = await DocumentPicker.getDocumentAsync({ type: accept, multiple, copyToCacheDirectory: false });
  if (res.canceled || !res.assets) return [];
  return Promise.all(res.assets.map(async (a) => ({ name: a.name, bytes: new Uint8Array(await (a.file as File).arrayBuffer()) })));
}
