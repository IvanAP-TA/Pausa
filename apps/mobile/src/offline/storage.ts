// Web: the outbox is one JSON string in localStorage, through the same read/write helpers as the theme choice. A private window that
// refuses storage keeps the queue for the session only (readStored/writeStored swallow the error).
import { readStored, writeStored } from "@/theme/pref-storage";
import type { QueuedLog } from "./outbox";

const KEY = "pausa-outbox-v1";

export async function loadQueue(): Promise<QueuedLog[]> {
  try {
    const raw = await readStored(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueuedLog[]) : [];
  } catch {
    return [];
  }
}

export const saveQueue = (list: QueuedLog[]) => writeStored(KEY, JSON.stringify(list));
