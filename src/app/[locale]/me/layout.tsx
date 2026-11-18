import { cookies } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/session";
import { getMyCircles } from "@/lib/data";
import { Wordmark } from "@/components/brand";
import { LAST_CIRCLE_COOKIE } from "@/components/circle-memory";
import { SpaceSwitch } from "@/components/space-switch";
import { Link } from "@/i18n/navigation";

/** The personal space: the same top as a Cerchia (the two spaces, then the mast), and one column of content. */
export default async function MeLayout({ children, params }: LayoutProps<"/[locale]/me">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser();
  const circles = await getMyCircles(user.id);
  const last = (await cookies()).get(LAST_CIRCLE_COOKIE)?.value;
  const circle = circles.find((c) => c.id === last) ?? circles[0] ?? null;

  return (
    <div className="projector mx-auto min-h-dvh max-w-md lg:max-w-[40rem]">
      <SpaceSwitch current="personal" circle={circle} />
      <div className="flex h-14 items-center px-4">
        <Link href="/me" aria-label="Pausa" className="inline-flex min-h-11 items-center"><Wordmark /></Link>
      </div>
      {children}
    </div>
  );
}
