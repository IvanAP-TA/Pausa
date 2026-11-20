import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getCircleForMember, getMyCircles, getUnreadCount } from "@/lib/data";
import { Shell } from "@/components/shell";

export default async function CircleLayout({ children, params }: LayoutProps<"/[locale]/c/[circleId]">) {
  const { locale, circleId } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  // Non-members get a 404, not a 403: a Cerchia's existence is private too.
  const circle = await getCircleForMember(circleId, user.id);
  if (!circle) notFound();
  const [circles, unread] = await Promise.all([getMyCircles(user.id), getUnreadCount(user.id)]);
  return (
    <Shell circle={circle} circles={circles} me={{ id: user.id, name: user.name, image: user.image }} unread={unread} remember aside>
      {children}
    </Shell>
  );
}
