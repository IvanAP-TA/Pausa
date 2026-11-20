import { cookies } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getMyCircles, getUnreadCount } from "@/lib/data";
import { LAST_CIRCLE_COOKIE } from "@/components/circle-memory";
import { Shell } from "@/components/shell";

/** My profile and everything only mine: the same frame as a Cerchia (the last one I visited stays the context on top). */
export default async function MeLayout({ children, params }: LayoutProps<"/[locale]/me">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const [circles, unread] = await Promise.all([getMyCircles(user.id), getUnreadCount(user.id)]);
  const last = (await cookies()).get(LAST_CIRCLE_COOKIE)?.value;
  const circle = circles.find((c) => c.id === last) ?? circles[0] ?? null;
  return (
    <Shell circle={circle} circles={circles} me={{ id: user.id, name: user.name, image: user.image }} unread={unread}>
      {children}
    </Shell>
  );
}
