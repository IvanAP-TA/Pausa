import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { getRoomView, getSerataByCode, isParticipant } from "@/lib/serata/server";
import { JoinGate } from "./join-gate";
import { SerataRoom } from "./room";

export async function generateMetadata({ params }: PageProps<"/[locale]/s/[code]">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "serata" });
  return { title: t("title"), robots: { index: false } };
}

/** The Serata room. Guest-first: no account needed, just a name. */
export default async function SerataPage({ params }: PageProps<"/[locale]/s/[code]">) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const serata = await getSerataByCode(code);
  if (!serata) notFound();

  const session = await getSession();
  const joined = session ? await isParticipant(serata.id, session.user.id) : false;

  if (!joined) {
    // Someone opening a finished Serata's link just sees the result card.
    if (serata.status === "done") redirect(`/${locale}/s/${serata.code}/card`);
    const isGuest = !session || Boolean((session.user as { isAnonymous?: boolean | null }).isAnonymous);
    return <JoinGate code={serata.code} asGuest={isGuest} hasSession={Boolean(session)} defaultName={session && isGuest ? session.user.name : ""} />;
  }

  const view = await getRoomView(serata.code, session!.user.id, locale);
  const isGuest = Boolean((session!.user as { isAnonymous?: boolean | null }).isAnonymous);
  return <SerataRoom initial={view!} meId={session!.user.id} isGuest={isGuest} />;
}
