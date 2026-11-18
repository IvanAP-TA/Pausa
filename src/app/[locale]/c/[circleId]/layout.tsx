import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getCircleForMember } from "@/lib/data";
import { TabBar } from "@/components/tab-bar";
import { CircleMemory } from "@/components/circle-memory";
import { Wordmark } from "@/components/brand";
import { Link } from "@/i18n/navigation";

export default async function CircleLayout({ children, params }: LayoutProps<"/[locale]/c/[circleId]">) {
  const { locale, circleId } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  // Non-members get a 404, not a 403: a Cerchia's existence is private too.
  if (!(await getCircleForMember(circleId, user.id))) notFound();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col lg:max-w-[62rem] lg:flex-row lg:gap-8">
      <CircleMemory circleId={circleId} />
      {/* On a phone every page opens under the mast (the rail carries the wordmark from 64rem), so a page starts close to it. */}
      <div className="projector flex-1 max-lg:[&>main]:pt-2 lg:order-2 lg:max-w-[40rem]">
        <div className="flex h-14 items-center px-4 lg:hidden">
          <Link href={`/c/${circleId}`} aria-label="Pausa" className="inline-flex min-h-11 items-center"><Wordmark /></Link>
        </div>
        {children}
      </div>
      <TabBar circleId={circleId} me={{ id: user.id, name: user.name, image: user.image }} />
    </div>
  );
}
