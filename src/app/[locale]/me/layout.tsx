import { cookies } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getMyCircles } from "@/lib/data";
import { LAST_CIRCLE_COOKIE } from "@/components/circle-memory";
import { SpaceSwitch } from "@/components/space-switch";

/** The personal space: the same bar on top as a Cerchia (it says "Il mio spazio" and switches to any Cerchia), then one column. */
export default async function MeLayout({ children, params }: LayoutProps<"/[locale]/me">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const circles = await getMyCircles(user.id);
  const last = (await cookies()).get(LAST_CIRCLE_COOKIE)?.value;
  // Most recent Cerchia first in the switcher, so the way back is the first row.
  const ordered = [...circles].sort((a, b) => (a.id === last ? -1 : b.id === last ? 1 : 0));

  return (
    <div className="projector mx-auto min-h-dvh max-w-md lg:max-w-[40rem]">
      <SpaceSwitch current="personal" circle={null} circles={ordered} me={{ id: user.id, name: user.name, image: user.image }} />
      {children}
    </div>
  );
}
