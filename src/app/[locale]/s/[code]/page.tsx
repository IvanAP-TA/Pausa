import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { getRoomView, getSerataByCode, isParticipant } from "@/lib/serata/server";
import { JoinGate } from "./join-gate";
import { SerataRoom } from "./room";

export async function generateMetadata({ params }: PageProps<"/[locale]/s/[code]">) {
  const { locale, code } = await params;
  const t = await getTranslations({ locale, namespace: "serata" });
  const serata = await getSerataByCode(code);
  // The link preview: the Card once decided, an invitation while it is open. Neither shows who voted what.
  const image = !serata ? undefined
    : serata.status === "done" ? `/api/serata/${serata.code}/card?format=og&locale=${locale}`
    : `/api/serata/${serata.code}/invite?locale=${locale}`;
  const title = t(serata?.status === "done" ? "invite.titleDone" : "invite.title");
  const description = t("invite.description");
  return {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, siteName: "Pausa", ...(image ? { images: [{ url: image, width: 1200, height: 630 }] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(image ? { images: [image] } : {}) },
  };
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
