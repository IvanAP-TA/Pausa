import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { getDb } from "@/db";
import { getCurrentUser } from "@/modules/auth";
import { joinByCode } from "@/modules/circles";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/?join=${encodeURIComponent(code)}`);
  }
  const db = getDb(env().DB);
  const res = await joinByCode(db, user.id, code.toUpperCase(), Date.now());
  if ("circleId" in res) redirect(`/circles/${res.circleId}`);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-2xl text-ink">Invito non valido</h1>
      <p className="text-ink-dim">Il codice è scaduto o non esiste.</p>
      <Link href="/circles" className="text-mandarin hover:underline">Vai alle tue Cerchie</Link>
    </main>
  );
}
