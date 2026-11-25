// Android / iOS: a file in the app's document directory (a SecureStore value is too small for a long review). Not exercised on a
// device in this work: it compiles and mirrors the web contract.
import { File, Paths } from "expo-file-system";
import type { QueuedLog } from "./outbox";

const file = () => new File(Paths.document, "pausa-outbox-v1.json");

export async function loadQueue(): Promise<QueuedLog[]> {
  try {
    const f = file();
    if (!f.exists) return [];
    const parsed: unknown = JSON.parse(await f.text());
    return Array.isArray(parsed) ? (parsed as QueuedLog[]) : [];
  } catch {
    return [];
  }
}

export async function saveQueue(list: QueuedLog[]): Promise<void> {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(list));
  } catch {
    // disk full or unavailable: the queue lives in memory for this session
  }
}
