import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { diaryApi } from "@/api/diary";
import { isOnline, onBackOnline, subscribeOnline } from "@/offline/connectivity";
import { Outbox, looksSent, type NewEntry, type QueuedLog } from "@/offline/outbox";
import { loadQueue, saveQueue } from "@/offline/storage";
import { useSession } from "../session";

type Value = {
  /** This person's waiting and failed viewings, oldest first. */
  entries: QueuedLog[];
  online: boolean;
  /** How many viewings the outbox has sent since the app opened (screens that list the diary reload when it grows). */
  sent: number;
  enqueue: (n: Omit<NewEntry, "userId">) => Promise<QueuedLog | null>;
  retry: (id: string) => void;
  discard: (id: string) => void;
  flush: () => void;
};

const Ctx = createContext<Value | null>(null);
const uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
const RETRY_MS = 30_000;

export function OutboxProvider({ children }: { children: ReactNode }) {
  const { state } = useSession();
  const userId = state.status === "ready" ? state.me.id : null;
  const outbox = useMemo(
    () =>
      new Outbox({
        load: loadQueue,
        save: saveQueue,
        send: (e) => diaryApi.createLog(e.input, e.id),
        alreadyThere: async (e) => looksSent(e, (await diaryApi.diary({ locale: e.input.locale ?? "it" })).items),
        isOnline,
        now: Date.now,
        uuid,
      }),
    [],
  );
  const all = useSyncExternalStore(outbox.subscribe, outbox.snapshot, outbox.snapshot);
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);
  const [sent, setSent] = useState(0);
  const userRef = useRef(userId);
  userRef.current = userId;

  const flush = useCallback(() => {
    const id = userRef.current;
    if (!id) return;
    void outbox.flush(id).then((n) => n > 0 && setSent((s) => s + n));
  }, [outbox]);

  const entries = useMemo(() => (userId ? all.filter((e) => e.userId === userId) : []), [all, userId]);
  const waiting = entries.some((e) => e.status !== "failed");

  // Load the stored queue, then try it once; try again when the connection or the app comes back, and on a timer while something waits.
  useEffect(() => {
    if (!userId) return;
    void outbox.init().then(flush);
    return onBackOnline(flush);
  }, [userId, outbox, flush]);
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(flush, RETRY_MS);
    return () => clearInterval(t);
  }, [waiting, flush]);

  const value = useMemo<Value>(
    () => ({
      entries,
      online,
      sent,
      enqueue: async (n) => {
        if (!userId) return null;
        return outbox.enqueue({ ...n, userId });
      },
      retry: (id) => {
        if (userId) void outbox.retry(id, userId).then((c) => c > 0 && setSent((s) => s + c));
      },
      discard: (id) => void outbox.discard(id),
      flush,
    }),
    [entries, online, sent, userId, outbox, flush],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOutbox(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOutbox outside OutboxProvider");
  return v;
}
