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
      <main className="mx-auto grid min-h-dvh w-full max-w-[40rem] grid-rows-[auto_1fr] px-4 py-6">
        <p className="font-display text-2xl text-ink">Pausa</p>
        <div className="grid content-center gap-4 py-10">
          <h1 className="display text-poster">{t(`invalid.${reason}.title`)}</h1>
          <p className="max-w-[45ch] text-lg text-ink-2">{t(`invalid.${reason}.body`)}</p>
        </div>
      </main>
    );
  }

  // Joining a Cerchia needs a real account; Serata guests sign in here (their guest session gets linked).
  const session = await getSession();
  if (!session || (session.user as { isAnonymous?: boolean | null }).isAnonymous) {
    redirect(`/${locale}/sign-in?next=${encodeURIComponent(`/${locale}/join/${code}`)}`);
  }

  return (
    <main className="projector mx-auto grid min-h-dvh w-full max-w-[40rem] grid-rows-[auto_1fr] px-4 py-6">
      <p className="font-display text-2xl text-ink">Pausa</p>
      <div className="grid content-center gap-8 py-10">
        <header className="grid min-w-0 gap-4">
          <h1 className="display text-poster">{t("title", { name: invite.circleName })}</h1>
          <p className="max-w-[45ch] text-lg text-ink-2">{t("body")}</p>
        </header>
        <form action={joinCircle}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="code" value={decodeURIComponent(code)} />
          <button className="btn btn-primary btn-lg w-full sm:w-fit">{t("cta")}</button>
        </form>
      </div>
    </main>
  );
}
