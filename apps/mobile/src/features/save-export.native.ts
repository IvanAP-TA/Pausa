import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

const NAME = "pausa-data.json";

/** Android / iOS: the JSON goes to the cache directory and the system share sheet lets the person choose where it lands. */
export async function saveExport(json: string): Promise<void> {
  const file = new File(Paths.cache, NAME);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: "application/json", UTI: "public.json" });
}
