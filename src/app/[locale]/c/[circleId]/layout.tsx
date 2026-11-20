import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getCircleForMember, getMyCircles, getUnreadCount } from "@/lib/data";
import { TabBar } from "@/components/tab-bar";
import { CircleMemory } from "@/components/circle-memory";
import { SpaceSwitch } from "@/components/space-switch";

export default async function CircleLayout({ children, params }: LayoutProps<"/[locale]/c/[circleId]">) {
  const { locale, circleId } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  // Non-members get a 404, not a 403: a Cerchia's existence is private too.
  const circle = await getCircleForMember(circleId, user.id);
  if (!circle) notFound();
  const [circles, unread] = await Promise.all([getMyCircles(user.id), getUnreadCount(user.id)]);
  const me = { id: user.id, name: user.name, image: user.image };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col lg:max-w-[62rem] lg:flex-row lg:gap-8">
      <CircleMemory circleId={circleId} />
      {/* One bar on top (where am I, the bell, me), the page, and the tabs under the thumb (a rail from 64rem). */}
      <div className="projector flex-1 lg:order-2 lg:max-w-[40rem]">
        <SpaceSwitch current="circle" circle={circle} circles={circles} me={me} unread={unread} />
        {children}
      </div>
      <TabBar circleId={circleId} me={me} />
    </div>
  );
}
