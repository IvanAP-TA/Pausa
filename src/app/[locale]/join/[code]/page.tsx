import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getDb } from "@/db";
import { getSession } from "@/lib/auth";
import { joinCircle } from "@/lib/actions";
import { peekInvite } from "@/lib/core/circles";

export default async function Join({ params }: PageProps<"/[locale]/join/[code]">) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("join");

  const invite = await peekInvite(await getDb(), decodeURIComponent(code));

  // Say exactly why a link doesn't work: "expired" is something the person can fix by asking for a new one.
  if (!invite || invite.state !== "active") {
    const reason = invite?.state ?? "not_found";
    return (
      <main className="mx-auto grid min-h-dvh max-w-md content-center gap-3 px-4">
        <p className="font-display text-sm text-accent">Pausa</p>
        <h1 className="font-display text-[2rem] leading-tight">{t(`invalid.${reason}.title`)}</h1>
        <p className="text-muted">{t(`invalid.${reason}.body`)}</p>
      </main>
    );
  }

  // Joining a Cerchia needs a real account; Serata guests sign in here (their guest session gets linked).
  const session = await getSession();
  if (!session || (session.user as { isAnonymous?: boolean | null }).isAnonymous) {
    redirect(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/join/${code}`)}`);
  }

  return (
    <main className="projector mx-auto grid min-h-dvh max-w-md content-center gap-8 px-4">
      <header>
        <p className="font-display text-sm text-accent">Pausa</p>
        <h1 className="mt-2 font-display text-[2rem] leading-tight">{t("title", { name: invite.circleName })}</h1>
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
