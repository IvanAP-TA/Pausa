import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getDb, schema as s } from "@/db";
import { getSession } from "@/lib/auth";
import { joinCircle } from "@/lib/actions";

export default async function Join({ params }: PageProps<"/[locale]/join/[code]">) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("join");

  const db = await getDb();
  const [circle] = await db.select({ id: s.circle.id, name: s.circle.name }).from(s.circle)
    .where(eq(s.circle.inviteCode, decodeURIComponent(code).toUpperCase()));

  if (!circle) {
    return (
      <main className="mx-auto grid min-h-dvh max-w-md content-center px-4">
        <p className="font-display text-2xl font-semibold">{t("invalid")}</p>
      </main>
    );
  }

  // Not signed in yet: sign in first, then come back here.
  // Joining a Cerchia needs a real account; Serata guests sign in here (their guest session gets linked).
  const session = await getSession();
  if (!session || (session.user as { isAnonymous?: boolean | null }).isAnonymous) {
    redirect(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/join/${code}`)}`);
  }

  return (
    <main className="projector mx-auto grid min-h-dvh max-w-md content-center gap-8 px-4">
      <header>
        <p className="font-display text-sm font-semibold text-accent">Pausa</p>
        <h1 className="mt-2 font-display text-[2rem] font-semibold leading-tight">{t("title", { name: circle.name })}</h1>
        <p className="mt-3 text-muted">{t("body")}</p>
      </header>
      <form action={joinCircle}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="code" value={decodeURIComponent(code)} />
        <button className="min-h-12 w-full rounded-full bg-accent font-semibold text-on-accent hover:bg-accent-hover">{t("cta")}</button>
      </form>
    </main>
  );
}
