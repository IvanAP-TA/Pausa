import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { getDb } from "@/db";
import { getCurrentUser } from "@/modules/auth";
import { listNotifications } from "@/modules/notifications";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  new_log: "ha loggato un film",
  new_comment: "ha commentato",
  reaction: "ha reagito",
  invite_accepted: "è entrato nella Cerchia",
};

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const db = getDb(env().DB);
  const notes = await listNotifications(db, user.id);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold text-ink">Notifiche</h1>
        <Link href="/circles" className="text-sm text-ink-dim hover:text-ink">← Cerchie</Link>
      </div>

      {notes.length === 0 ? (
        <p className="text-ink-dim">Nessuna notifica.</p>
      ) : (
        <ul className="grid gap-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border px-4 py-3 text-sm ${
                n.isRead ? "border-line bg-surface-1 text-ink-dim" : "border-forest/40 bg-forest/10 text-ink"
              }`}
            >
              Qualcuno {LABEL[n.type] ?? n.type}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
